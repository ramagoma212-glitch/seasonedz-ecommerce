// Milestone 201: B2B CRM sales workflow and quotations. Every admin call is
// mocked with page.route(), so no real contact, order or email is touched.
// The rules that matter most are checked in the browser: recording a reply
// never sends a status change, a suppressed contact can never be sent a
// quotation, and a sent quotation offers no edit or resend controls.
import { test, expect } from "@playwright/test";

const CONTACT = {
  id: "contact-1",
  organisationName: "Sunnyside Primary School",
  contactName: "Mrs Dlamini",
  contactRole: "Principal",
  email: "office@sunnyside.test",
  buyerEmail: null,
  phone: "012 000 0000",
  website: null,
  organisationType: "Primary school",
  province: "Gauteng",
  city: "Pretoria",
  notes: null,
  status: "ACTIVE",
  leadStatus: "NEGOTIATING",
  lastContactedAt: "2026-10-01T08:00:00.000Z",
  lastCatalogueSentAt: null,
  nextFollowUpAt: "2026-10-05T00:00:00.000Z",
  nextAction: "Confirm quantities",
  followUpState: "UPCOMING",
  createdAt: "2026-09-01T08:00:00.000Z",
};

const ORDER = { id: "order-1", orderNumber: "SG-100001", createdAt: "2026-09-20T09:00:00.000Z", status: "DELIVERED", total: "1200.00" };

const QUOTE_DRAFT = {
  id: "quote-1",
  quotationNumber: "SG-Q-2026-0001",
  contactId: "contact-1",
  status: "DRAFT",
  quotationDate: "2026-10-04T08:00:00.000Z",
  validUntil: "2026-11-03T08:00:00.000Z",
  organisationNameSnapshot: "Sunnyside Primary School",
  contactNameSnapshot: "Mrs Dlamini",
  emailSnapshot: "office@sunnyside.test",
  phoneSnapshot: "012 000 0000",
  billingAddress: null,
  notes: null,
  subtotal: "1000.00",
  discountAmount: "0.00",
  deliveryAmount: "0.00",
  total: "1000.00",
  sentAt: null,
  lines: [{ position: 1, productId: "prod-1", descriptionSnapshot: "ABC Colouring Book", skuSnapshot: "SG-0001", quantity: 10, unitPrice: "100.00", lineTotal: "1000.00" }],
  contact: { id: "contact-1", organisationName: "Sunnyside Primary School", email: "office@sunnyside.test", status: "ACTIVE", leadStatus: "NEGOTIATING" },
};

const QUOTE_SENT = { ...QUOTE_DRAFT, id: "quote-2", quotationNumber: "SG-Q-2026-0002", status: "SENT", sentAt: "2026-10-03T08:00:00.000Z" };

function envelope(data) {
  return JSON.stringify({ success: true, message: "OK", data });
}

async function mockAdminAuth(page) {
  await page.route("**/api/admin/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ id: "admin-1", email: "owner@example.invalid", name: "Owner", role: "ADMIN" }) }));
}

async function mockContactPages(page, { contact = CONTACT, orders = [ORDER], quotations = [QUOTE_SENT] } = {}) {
  await page.route(/\/api\/admin\/outreach\/contacts\/contact-1\/history$/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope({ contact, history: [] }) })
  );
  await page.route(/\/api\/admin\/outreach\/contacts\/contact-1\/crm-detail$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: envelope({
        timeline: [
          { kind: "activity", id: "a1", type: "REPLY_RECEIVED", channel: "EMAIL", occurredAt: "2026-10-02T09:00:00.000Z", title: "Asked for a catalogue", details: null, createdByAdminNameSnapshot: "Owner" },
          { kind: "activity", id: "a2", type: "QUOTE_SENT", channel: "EMAIL", occurredAt: "2026-10-03T08:00:00.000Z", title: "Quotation SG-Q-2026-0002 sent by email", details: null, quotationId: "quote-2", createdByAdminNameSnapshot: "Owner" },
        ],
        linkedOrders: orders,
        enquiries: [{ id: "enq-1", type: "SCHOOL", status: "NEW", subject: "Bulk pricing", createdAt: "2026-09-30T08:00:00.000Z" }],
        quotations,
      }),
    })
  );
  await page.route(/\/api\/admin\/outreach\/contacts\/contact-1\/activities$/, (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({ status: 201, contentType: "application/json", body: envelope({ id: "a3" }) });
  });
  await page.route(/\/api\/admin\/outreach\/contacts\/contact-1\/follow-up\/complete$/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope({ id: "a4" }) })
  );
}

async function mockQuotationDetail(page, quote) {
  await page.route(new RegExp(`/api/admin/outreach/quotations/${quote.id}$`), (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope(quote) })
  );
}

test.describe("CRM contact sales view (Milestone 201)", () => {
  test("shows next action, timeline, quotations, linked orders and enquiries", async ({ page }) => {
    await mockAdminAuth(page);
    await mockContactPages(page);
    await page.goto("/admin/outreach/contacts/contact-1");

    await expect(page.getByRole("heading", { name: "Sunnyside Primary School" })).toBeVisible();
    await expect(page.getByText("Confirm quantities").first()).toBeVisible();
    await expect(page.getByText("Asked for a catalogue")).toBeVisible();
    await expect(page.getByRole("link", { name: "SG-Q-2026-0002" })).toBeVisible();
    await expect(page.getByRole("link", { name: "SG-100001" })).toBeVisible();
    await expect(page.getByText("Bulk pricing")).toBeVisible();
  });

  test("recording a reply sends the reply and never a lead status or eligibility change", async ({ page }) => {
    await mockAdminAuth(page);
    await mockContactPages(page);
    const requests = [];
    page.on("request", (request) => {
      if (request.url().includes("/activities") && request.method() === "POST") requests.push(request.postDataJSON());
    });
    await page.goto("/admin/outreach/contacts/contact-1");

    await page.locator('form[data-activity-type="REPLY_RECEIVED"] input[name="title"]').fill("Wants 100 books");
    await page.locator('form[data-activity-type="REPLY_RECEIVED"] button[type="submit"]').click();
    await expect.poll(() => requests.length).toBe(1);

    const body = requests[0];
    expect(body.type).toBe("REPLY_RECEIVED");
    expect(body.channel).toBe("EMAIL");
    expect(body.title).toBe("Wants 100 books");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("leadStatus");
  });

  test("the reply form says it does not change the lead status", async ({ page }) => {
    await mockAdminAuth(page);
    await mockContactPages(page);
    await page.goto("/admin/outreach/contacts/contact-1");
    await expect(page.locator("details", { hasText: "Record Reply" }).getByText("It does not change the lead status")).toBeVisible();
  });

  test("completing a follow-up posts to the follow-up completion endpoint", async ({ page }) => {
    await mockAdminAuth(page);
    await mockContactPages(page);
    let hit = false;
    page.on("request", (request) => {
      if (request.url().includes("/follow-up/complete") && request.method() === "POST") hit = true;
    });
    await page.goto("/admin/outreach/contacts/contact-1");
    await page.locator("details", { hasText: "Mark Follow-up Completed" }).locator("summary").click();
    await page.locator('form[data-crm-action="complete-follow-up"] button[type="submit"]').click();
    await expect.poll(() => hit).toBe(true);
  });

  test("the contact page at 375px has no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await mockAdminAuth(page);
    await mockContactPages(page);
    await page.goto("/admin/outreach/contacts/contact-1");
    await expect(page.getByRole("heading", { name: "Sunnyside Primary School" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("B2B quotations (Milestone 201)", () => {
  test("a suppressed contact gets a refusal and no send form", async ({ page }) => {
    await mockAdminAuth(page);
    await mockQuotationDetail(page, { ...QUOTE_DRAFT, contact: { ...QUOTE_DRAFT.contact, status: "UNSUBSCRIBED" } });
    await page.goto("/admin/outreach/quotations/quote-1");
    await expect(page.getByText("cannot be emailed", { exact: false })).toBeVisible();
    await expect(page.locator("[data-admin-quotation-send-form]")).toHaveCount(0);
  });

  test("an active draft shows the send panel that requires typing the recipient", async ({ page }) => {
    await mockAdminAuth(page);
    await mockQuotationDetail(page, QUOTE_DRAFT);
    await page.goto("/admin/outreach/quotations/quote-1");
    await expect(page.locator("[data-admin-quotation-send-form]")).toBeVisible();
    const input = page.locator('[data-admin-quotation-send-form] input[name="confirmRecipientEmail"]');
    await expect(input).toHaveAttribute("required", "");
  });

  test("a sent quotation offers no edit, no send and no resend, only the outcome actions", async ({ page }) => {
    await mockAdminAuth(page);
    await mockQuotationDetail(page, QUOTE_SENT);
    await page.goto("/admin/outreach/quotations/quote-2");
    await expect(page.locator("[data-admin-quotation-send-form]")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit Draft" })).toHaveCount(0);
    await expect(page.locator('[data-quote-action="accept"]')).toBeVisible();
    await expect(page.locator('[data-quote-action="decline"]')).toBeVisible();
  });

  test("sending posts the typed recipient only after the browser confirmation", async ({ page }) => {
    await mockAdminAuth(page);
    await mockQuotationDetail(page, QUOTE_DRAFT);
    let sentBody = null;
    await page.route(/\/api\/admin\/outreach\/quotations\/quote-1\/send$/, (route) => {
      sentBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...QUOTE_DRAFT, status: "SENT" }) });
    });
    page.on("dialog", (dialog) => dialog.accept());

    await page.goto("/admin/outreach/quotations/quote-1");
    await page.locator('[data-admin-quotation-send-form] input[name="confirmRecipientEmail"]').fill("office@sunnyside.test");
    await page.locator('[data-admin-quotation-send-form] button[type="submit"]').click();
    await expect.poll(() => sentBody).not.toBeNull();
    expect(sentBody).toEqual({ confirmRecipientEmail: "office@sunnyside.test" });
  });

  test("declining the send confirmation sends nothing", async ({ page }) => {
    await mockAdminAuth(page);
    await mockQuotationDetail(page, QUOTE_DRAFT);
    let called = false;
    await page.route(/\/api\/admin\/outreach\/quotations\/quote-1\/send$/, (route) => {
      called = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({}) });
    });
    page.on("dialog", (dialog) => dialog.dismiss());

    await page.goto("/admin/outreach/quotations/quote-1");
    await page.locator('[data-admin-quotation-send-form] input[name="confirmRecipientEmail"]').fill("office@sunnyside.test");
    await page.locator('[data-admin-quotation-send-form] button[type="submit"]').click();
    await page.waitForTimeout(300);
    expect(called).toBe(false);
  });

  test("a sent quotation cannot be opened in the edit form", async ({ page }) => {
    await mockAdminAuth(page);
    await mockQuotationDetail(page, QUOTE_SENT);
    await page.goto("/admin/outreach/quotations/quote-2/edit");
    await expect(page.getByText("cannot be edited", { exact: false })).toBeVisible();
    await expect(page.locator("[data-admin-quotation-form]")).toHaveCount(0);
  });

  test("the quotation list shows the status summary and rows", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route(/\/api\/admin\/outreach\/quotations\/summary$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ DRAFT: 1, SENT: 1, ACCEPTED: 0, DECLINED: 0, EXPIRED: 0, CANCELLED: 0 }) })
    );
    await page.route(/\/api\/admin\/outreach\/quotations(\?.*)?$/, (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ items: [QUOTE_DRAFT, QUOTE_SENT], total: 2, page: 1, limit: 25 }),
      });
    });
    await page.goto("/admin/outreach/quotations");
    await expect(page.getByRole("link", { name: "SG-Q-2026-0001" })).toBeVisible();
    await expect(page.getByRole("link", { name: "SG-Q-2026-0002" })).toBeVisible();
  });

  test("the quotation list at 375px has no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await mockAdminAuth(page);
    await page.route(/\/api\/admin\/outreach\/quotations\/summary$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ DRAFT: 0, SENT: 0, ACCEPTED: 0, DECLINED: 0, EXPIRED: 0, CANCELLED: 0 }) })
    );
    await page.route(/\/api\/admin\/outreach\/quotations(\?.*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ items: [], total: 0, page: 1, limit: 25 }) })
    );
    await page.goto("/admin/outreach/quotations");
    await expect(page.getByRole("heading", { name: "Quotations" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("Unresolved quotation sends (Milestone 201 correction)", () => {
  const QUOTE_UNCERTAIN = { ...QUOTE_DRAFT, id: "quote-3", quotationNumber: "SG-Q-2026-0003", status: "SEND_UNCERTAIN", lastSendError: "Outcome unknown: no confirmed response from the email provider." };

  test("an unconfirmed send is shown as uncertain, offers no resend, and blocks edits and duplicates", async ({ page }) => {
    await mockAdminAuth(page);
    await mockQuotationDetail(page, QUOTE_UNCERTAIN);
    await page.goto("/admin/outreach/quotations/quote-3");
    await expect(page.getByText("did not confirm whether this quotation was delivered")).toBeVisible();
    await expect(page.locator("[data-admin-quotation-send-form]")).toHaveCount(0);
    await expect(page.locator('[data-quote-action="duplicate"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit Draft" })).toHaveCount(0);
    await expect(page.locator("[data-admin-quotation-reconcile-form]")).toBeVisible();
  });

  test("reconciling requires a written note before anything is sent", async ({ page }) => {
    await mockAdminAuth(page);
    await mockQuotationDetail(page, QUOTE_UNCERTAIN);
    let called = false;
    await page.route(/\/api\/admin\/outreach\/quotations\/quote-3\/reconcile$/, (route) => {
      called = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...QUOTE_UNCERTAIN, status: "SENT" }) });
    });
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/admin/outreach/quotations/quote-3");
    await page.locator('[data-admin-quotation-reconcile-form] button[value="SENT"]').click();
    await page.waitForTimeout(300);
    expect(called).toBe(false);
  });

  test("confirming a delivered email posts the outcome and the note to the reconcile endpoint", async ({ page }) => {
    await mockAdminAuth(page);
    await mockQuotationDetail(page, QUOTE_UNCERTAIN);
    let body = null;
    await page.route(/\/api\/admin\/outreach\/quotations\/quote-3\/reconcile$/, (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...QUOTE_UNCERTAIN, status: "SENT" }) });
    });
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/admin/outreach/quotations/quote-3");
    await page.locator('[data-admin-quotation-reconcile-form] textarea[name="note"]').fill("Found it in the sent folder");
    await page.locator('[data-admin-quotation-reconcile-form] button[value="SENT"]').click();
    await expect.poll(() => body).not.toBeNull();
    expect(body).toEqual({ outcome: "SENT", note: "Found it in the sent folder" });
  });

  test("the quotation list labels the unconfirmed state for the admin", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route(/\/api\/admin\/outreach\/quotations\/summary$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ DRAFT: 0, SENDING: 0, SEND_UNCERTAIN: 1, SENT: 0, ACCEPTED: 0, DECLINED: 0, EXPIRED: 0, CANCELLED: 0 }) })
    );
    await page.route(/\/api\/admin\/outreach\/quotations(\?.*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ items: [QUOTE_UNCERTAIN], total: 1, page: 1, limit: 25 }) })
    );
    await page.goto("/admin/outreach/quotations");
    await expect(page.getByText("Sending / uncertain").first()).toBeVisible();
  });
});
