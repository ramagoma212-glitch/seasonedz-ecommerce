// Milestone 202: individual follow-up composer, preview, send confirmation, the
// unresolved-send warning, and the Needs Follow-up queue. Every admin call is
// mocked with page.route(). No email is sent by these tests.
import { test, expect } from "@playwright/test";

const CONTACT = {
  id: "contact-1",
  organisationName: "Sunnyside Primary School",
  contactName: "Mrs Dlamini",
  email: "office@sunnyside.test",
  organisationType: "School",
  status: "ACTIVE",
  leadStatus: "CONTACTED",
  lastContactedAt: "2026-09-01T08:00:00.000Z",
  nextFollowUpAt: null,
  nextAction: null,
};

const COMPOSER = {
  contact: CONTACT,
  latestCampaign: { name: "Schools Introduction", subject: "Colouring Books and Bulk Orders", sentAt: "2026-09-01T08:00:00.000Z" },
  suggestedTemplateKey: "education",
  assessment: { needsFollowUp: true, replied: false, reason: "No follow-up date set, last contacted over 7 days ago with no reply." },
  attempts: [],
  unresolvedAttemptId: null,
};

const PREVIEW = {
  recipientEmail: "office@sunnyside.test",
  templateKey: "education",
  templates: [
    { key: "education", label: "Schools and early learning" },
    { key: "general", label: "General organisation" },
  ],
  subject: "Following up: Colouring Books and Bulk Orders",
  bodyText: "Good day Mrs Dlamini,\n\nI am following up on the email we sent recently.\n\nIf you would like to know more, reply to this email.",
  signature: "Kind regards",
  fullBody:
    "Good day Mrs Dlamini,\n\nKind regards\n\nSeasonedz Group\nCall / WhatsApp: +27 72 844 5644\nEmail: seasonedzgroup@outlook.com\n\n---\nSeasonedz Group\nIf you'd rather not receive emails like this, unsubscribe here: https://example.invalid/unsubscribe",
  violations: [],
  blockedReasons: [],
  canSend: true,
  lockedByAttempt: false,
  generatedAt: "2026-10-05T10:00:00.000Z",
};

function envelope(data) {
  return JSON.stringify({ success: true, message: "OK", data });
}

async function mockAdminAuth(page) {
  await page.route("**/api/admin/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope({ id: "admin-1", email: "owner@example.invalid", name: "Owner", role: "ADMIN" }) })
  );
}

async function mockComposer(page, { composer = COMPOSER, preview = PREVIEW } = {}) {
  await mockAdminAuth(page);
  await page.route(/\/api\/admin\/outreach\/contacts\/contact-1\/follow-up$/, (route) =>
    route.request().method() === "GET" ? route.fulfill({ status: 200, contentType: "application/json", body: envelope(composer) }) : route.continue()
  );
  await page.route(/\/api\/admin\/outreach\/contacts\/contact-1\/follow-up\/preview$/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope(preview) })
  );
}

test.describe("Individual follow-up emails (Milestone 202)", () => {
  test("the composer shows context, and the preview carries the official callback number while sending nothing", async ({ page }) => {
    await mockComposer(page);
    let sendCalls = 0;
    page.on("request", (request) => {
      if (request.url().includes("/follow-up/send") && request.method() === "POST") sendCalls += 1;
    });
    await page.goto("/admin/outreach/contacts/contact-1/follow-up");
    await expect(page.getByText("Schools Introduction").first()).toBeVisible();
    await page.getByRole("button", { name: "Preview exact email" }).click();
    await expect(page.locator(".admin-followup-preview")).toContainText("+27 72 844 5644");
    await expect(page.locator(".admin-followup-preview")).toContainText("unsubscribe here");
    await page.waitForTimeout(300);
    expect(sendCalls).toBe(0);
  });

  test("a suppressed contact sees the refusal and cannot send", async ({ page }) => {
    const blocked = {
      ...PREVIEW,
      canSend: false,
      blockedReasons: ["This contact's email status is UNSUBSCRIBED. Follow-up emails are only sent to ACTIVE contacts. Their status is unchanged."],
    };
    await mockComposer(page, { preview: blocked });
    await page.goto("/admin/outreach/contacts/contact-1/follow-up");
    await expect(page.getByText("status is UNSUBSCRIBED", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Send follow-up email" })).toBeDisabled();
  });

  test("sending needs the browser confirmation and posts an idempotency key with the typed recipient", async ({ page }) => {
    await mockComposer(page);
    let body = null;
    await page.route(/\/api\/admin\/outreach\/contacts\/contact-1\/follow-up\/send$/, (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ attemptId: "a1", status: "ACCEPTED" }) });
    });
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/admin/outreach/contacts/contact-1/follow-up");
    await page.locator('input[name="confirmRecipientEmail"]').fill("office@sunnyside.test");
    await page.getByRole("button", { name: "Send follow-up email" }).click();
    await expect.poll(() => body).not.toBeNull();
    expect(body.confirmRecipientEmail).toBe("office@sunnyside.test");
    expect(body.idempotencyKey.length).toBeGreaterThanOrEqual(16);
    expect(body.subject).toContain("Following up");
  });

  test("declining the confirmation sends nothing", async ({ page }) => {
    await mockComposer(page);
    let called = false;
    await page.route(/\/api\/admin\/outreach\/contacts\/contact-1\/follow-up\/send$/, (route) => {
      called = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({}) });
    });
    page.on("dialog", (dialog) => dialog.dismiss());
    await page.goto("/admin/outreach/contacts/contact-1/follow-up");
    await page.locator('input[name="confirmRecipientEmail"]').fill("office@sunnyside.test");
    await page.getByRole("button", { name: "Send follow-up email" }).click();
    await page.waitForTimeout(300);
    expect(called).toBe(false);
  });

  test("an unresolved send shows the do-not-resend warning and the reconcile controls", async ({ page }) => {
    const unresolved = {
      ...COMPOSER,
      unresolvedAttemptId: "att-9",
      attempts: [{ id: "att-9", status: "UNCERTAIN", subject: "Following up", createdAt: "2026-10-04T10:00:00.000Z", settledAt: null, failureReason: null, reconciliationNote: null }],
    };
    await mockComposer(page, { composer: unresolved });
    await page.goto("/admin/outreach/contacts/contact-1/follow-up");
    await expect(page.getByText("unconfirmed outcome", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send follow-up email" })).toBeDisabled();
    await expect(page.locator("[data-admin-followup-reconcile-form]")).toBeVisible();
  });

  test("the Needs Follow-up queue lists contacts with their reason and sends nothing", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route(/\/api\/admin\/outreach\/contacts\/follow-up-queue$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({
          items: [
            {
              id: "contact-1",
              organisationName: "Sunnyside Primary School",
              organisationType: "School",
              contactName: "Mrs Dlamini",
              email: "office@sunnyside.test",
              leadStatus: "CONTACTED",
              lastContactedAt: "2026-09-01T08:00:00.000Z",
              nextFollowUpAt: null,
              nextAction: null,
              latestCampaign: null,
              reason: "No follow-up date set, last contacted over 7 days ago with no reply.",
            },
          ],
          counts: { needsFollowUp: 1, replied: 0, scheduled: 0, candidates: 1 },
        }),
      })
    );
    let sendCalls = 0;
    page.on("request", (request) => {
      if (request.url().includes("/follow-up/send")) sendCalls += 1;
    });
    await page.goto("/admin/outreach/follow-ups");
    await expect(page.getByText("No follow-up date set", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "Prepare follow-up" })).toHaveAttribute("href", "/admin/outreach/contacts/contact-1/follow-up");
    expect(sendCalls).toBe(0);
  });
});
