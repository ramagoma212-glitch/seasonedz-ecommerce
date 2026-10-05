// Milestone 202 completion: the Replied filter on the CRM contacts list. The
// request is mocked, so this checks the interface and the parameter only.
import { test, expect } from "@playwright/test";

function envelope(data) {
  return JSON.stringify({ success: true, message: "OK", data });
}

test("the Replied filter is offered and sends replied=true while keeping the other filters", async ({ page }) => {
  await page.route("**/api/admin/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope({ id: "admin-1", email: "owner@example.invalid", name: "Owner", role: "ADMIN" }) })
  );
  await page.route(/\/api\/admin\/outreach\/contacts\/distinct-values$/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope({ organisationTypes: [], provinces: [], cities: [], sources: [], tags: [] }) })
  );
  await page.route(/\/api\/admin\/outreach\/contacts\/crm-summary$/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope({ byLeadStatus: {}, dueToday: 0, overdue: 0 }) })
  );
  let requested = null;
  await page.route(/\/api\/admin\/outreach\/contacts(\?.*)?$/, (route) => {
    if (route.request().method() !== "GET") return route.continue();
    requested = new URL(route.request().url()).searchParams;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: envelope({ contacts: [], total: 0, page: 1, limit: 50, totalPages: 1 }),
    });
  });

  await page.goto("/admin/outreach/contacts?leadStatus=INTERESTED&replied=true");
  await expect(page.locator('select[name="replied"]')).toHaveValue("true");
  await expect.poll(() => requested?.get("replied")).toBe("true");
  expect(requested.get("leadStatus")).toBe("INTERESTED");
});
