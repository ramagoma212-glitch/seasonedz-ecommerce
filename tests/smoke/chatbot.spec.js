// Seasonedz AI Customer Assistant — frontend widget (Milestone 187).
// Runs only under the "chatbot" Playwright project (see
// playwright.config.js), the one build with VITE_TURNSTILE_SITE_KEY
// and VITE_CHATBOT_API_URL actually set — every other project's build
// has neither, so the widget stays hidden there by design (see
// js/chatbot.js's isChatbotConfigured()).
//
// Every test here mocks the Worker's own **/chat endpoint via
// page.route() — no test ever spends real Workers AI allocation or
// depends on the real deployed Worker being reachable.
//
// window.turnstile itself is also stubbed (via addInitScript, before
// js/chatbot.js's loadTurnstileScript() ever runs — it only loads the
// real script when window.turnstile is absent) rather than exercising
// Cloudflare's real challenge service: the real end-to-end path (a
// genuine siteverify call succeeding against the real Worker) was
// already proven manually during this milestone's own build/test
// phase — see the final report — and the real service's own load/
// settle timing is exactly the kind of external, network-dependent
// flakiness this project's test suite otherwise always mocks around
// (gtag.js, every backend endpoint, etc.). This stub only replaces
// Cloudflare's own widget; it never bypasses this project's own
// Turnstile-token plumbing (render -> execute -> callback -> token
// sent to the Worker), which is exactly what these tests exercise.
import { test, expect } from "@playwright/test";

function envelope(data) {
  return JSON.stringify(data);
}

async function stubTurnstile(page) {
  await page.addInitScript(() => {
    window.turnstile = {
      render: (container, options) => {
        window.__turnstileOptions = options;
        return "stub-widget-id";
      },
      execute: () => {
        setTimeout(() => window.__turnstileOptions?.callback?.("stub-turnstile-token"), 10);
      },
      reset: () => {},
    };
  });
}

async function mockChatEndpoint(page, responder) {
  await page.route("**/chat", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = JSON.parse(route.request().postData() || "{}");
    const result = responder(body);
    route.fulfill({ status: 200, contentType: "application/json", body: envelope(result) });
  });
}

// The chat launcher is deliberately hidden while the cookie consent
// banner is showing (both are fixed bottom elements; the banner's own
// Accept/Reject buttons must always win any overlap — see app.js's
// updateChatWidgetVisibility()), so every test that needs the widget
// dismisses the banner first, same as every other spec file in this
// project that needs to interact with the page below it.
async function acceptCookiesIfShown(page) {
  const acceptButton = page.locator('[data-action="cookie-accept"]');
  if (await acceptButton.count() > 0) await acceptButton.click();
}

async function openChat(page) {
  await acceptCookiesIfShown(page);
  await page.locator(".chat-widget__launcher").click();
  await expect(page.locator("#seasonedzChatPanel")).toBeVisible();
}

// stubTurnstile() uses addInitScript, which only takes effect on the
// NEXT navigation — so it must run before page.goto(), not after.
async function gotoAndOpenChat(page, path = "/") {
  await stubTurnstile(page);
  await page.goto(path);
  await openChat(page);
}

test.describe("Chat widget: visibility (Parts O, S)", () => {
  test("the launcher appears on a normal public page", async ({ page }) => {
    await page.goto("/");
    await acceptCookiesIfShown(page);
    await expect(page.locator(".chat-widget__launcher")).toBeVisible();
  });

  test("the launcher is hidden on the admin login route", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.locator("[data-chat-widget]")).toBeHidden();
  });

  test("the launcher is hidden on the customer password reset route", async ({ page }) => {
    await page.goto("/account/reset-password?token=sometoken");
    await expect(page.locator("[data-chat-widget]")).toBeHidden();
  });

  test("the launcher is hidden on checkout and order confirmation", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.locator("[data-chat-widget]")).toBeHidden();
    await page.goto("/order-confirmation");
    await expect(page.locator("[data-chat-widget]")).toBeHidden();
  });

  test("navigating from a public page to a private one hides the widget and closes an open panel", async ({ page }) => {
    await gotoAndOpenChat(page);
    await page.goto("/admin/login");
    await expect(page.locator("[data-chat-widget]")).toBeHidden();
  });
});

test.describe("Chat widget: welcome message and visitor id (Parts E, O)", () => {
  test("the deterministic welcome message shows immediately and never consumes a reply", async ({ page }) => {
    let chatCalled = false;
    await mockChatEndpoint(page, () => {
      chatCalled = true;
      return { reply: "should not be called", remaining: 6 };
    });
    await gotoAndOpenChat(page);

    await expect(page.locator("[data-chat-welcome]")).toContainText("Hi, I'm the Seasonedz Assistant");
    await expect(page.locator("[data-chat-status]")).toHaveText("7 replies available today");
    await page.waitForTimeout(300);
    expect(chatCalled).toBe(false);
  });

  test("an anonymous visitor id is generated and stored in localStorage once the visitor actually sends a message", async ({ page }) => {
    // Deliberately lazy — js/chatbot.js only generates/stores the id
    // in getVisitorId(), called from sendChatMessage() — a visitor who
    // never opens or uses the chat never gets one at all.
    await mockChatEndpoint(page, () => ({ reply: "Answer.", remaining: 6 }));
    await gotoAndOpenChat(page);
    await page.locator("[data-chat-input]").fill("What products do you have?");
    await page.locator("[data-chat-composer]").locator('button[type="submit"]').click();
    await expect(page.locator("[data-chat-messages]")).toContainText("Answer.");

    const visitorId = await page.evaluate(() => localStorage.getItem("seasonedz_chat_visitor_id"));
    expect(visitorId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test("the same visitor id is reused across page loads", async ({ page }) => {
    await mockChatEndpoint(page, () => ({ reply: "Answer.", remaining: 6 }));
    await gotoAndOpenChat(page);
    await page.locator("[data-chat-input]").fill("What products do you have?");
    await page.locator("[data-chat-composer]").locator('button[type="submit"]').click();
    await expect(page.locator("[data-chat-messages]")).toContainText("Answer.");
    const first = await page.evaluate(() => localStorage.getItem("seasonedz_chat_visitor_id"));

    await page.reload();
    const second = await page.evaluate(() => localStorage.getItem("seasonedz_chat_visitor_id"));
    expect(second).toBe(first);
  });
});

test.describe("Chat widget: sending a message (Parts F, Q, V)", () => {
  test("a real question is sent with the visitor id, and the server-confirmed remaining count is displayed", async ({ page }) => {
    let receivedVisitorId = null;
    await mockChatEndpoint(page, (body) => {
      receivedVisitorId = body.visitorId;
      return { reply: "We sell colouring books, markers and bundles.", remaining: 6, resetDate: "2026-09-18" };
    });
    await gotoAndOpenChat(page);
    await page.locator("[data-chat-input]").fill("What products do you have?");
    await page.locator("[data-chat-composer]").locator('button[type="submit"]').click();

    await expect(page.locator("[data-chat-messages]")).toContainText("We sell colouring books, markers and bundles.");
    await expect(page.locator("[data-chat-status]")).toHaveText("6 replies remaining today");
    const visitorId = await page.evaluate(() => localStorage.getItem("seasonedz_chat_visitor_id"));
    expect(receivedVisitorId).toBe(visitorId);
  });

  test("a suggested quick question behaves like a normal message", async ({ page }) => {
    await mockChatEndpoint(page, () => ({ reply: "Delivery is R100-R120, free above R600.", remaining: 6 }));
    await gotoAndOpenChat(page);
    await page.locator('[data-chat-quick-question="How much is delivery?"]').click();

    await expect(page.locator("[data-chat-messages]")).toContainText("How much is delivery?");
    await expect(page.locator("[data-chat-messages]")).toContainText("Delivery is R100-R120, free above R600.");
  });

  test("the composer is disabled while a reply is in flight and re-enabled afterwards", async ({ page }) => {
    await page.route("**/chat", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ reply: "Answer.", remaining: 6 }) });
    });
    await gotoAndOpenChat(page);
    await page.locator("[data-chat-input]").fill("What products do you have?");
    await page.locator("[data-chat-composer]").locator('button[type="submit"]').click();

    await expect(page.locator("[data-chat-input]")).toBeDisabled();
    await expect(page.locator("[data-chat-messages]")).toContainText("Answer.");
    await expect(page.locator("[data-chat-input]")).toBeEnabled();
  });
});

test.describe("Chat widget: limit reached and failure fallbacks (Parts R, X, Y)", () => {
  test("reaching 0 remaining disables the composer and shows the limit-reached message with support options", async ({ page }) => {
    await mockChatEndpoint(page, () => ({
      reply: "You have reached today's 7 AI replies. You can continue tomorrow or contact Seasonedz Group for help.",
      remaining: 0,
      resetDate: "2026-09-19",
      limitReached: true,
    }));
    await gotoAndOpenChat(page);
    await page.locator("[data-chat-input]").fill("One more question");
    await page.locator("[data-chat-composer]").locator('button[type="submit"]').click();

    await expect(page.locator("[data-chat-status]")).toHaveText("0 replies remaining today");
    await expect(page.locator("[data-chat-limit-reached]")).toBeVisible();
    await expect(page.locator("[data-chat-limit-reached]")).toContainText("You can use the assistant again tomorrow");
    await expect(page.locator("[data-chat-input]")).toBeDisabled();
    await expect(page.locator('[data-chat-limit-reached] a[href*="wa.me"]')).toBeVisible();
    await expect(page.locator('[data-chat-limit-reached] a[href="/contact"]')).toBeVisible();
    await expect(page.locator('[data-chat-limit-reached] a[href="/track-order"]')).toBeVisible();
  });

  test("an AI-unavailable response shows the friendly fallback and re-enables the composer for a retry", async ({ page }) => {
    await mockChatEndpoint(page, () => ({
      reply: "Our AI assistant is temporarily unavailable. Please contact Seasonedz Group for help.",
      remaining: 6,
      aiUnavailable: true,
    }));
    await gotoAndOpenChat(page);
    await page.locator("[data-chat-input]").fill("What products do you have?");
    await page.locator("[data-chat-composer]").locator('button[type="submit"]').click();

    await expect(page.locator("[data-chat-messages]")).toContainText("Our AI assistant is temporarily unavailable");
    await expect(page.locator("[data-chat-input]")).toBeEnabled();
  });

  test("a network failure reaching the Worker shows the fallback message rather than breaking the widget", async ({ page }) => {
    await page.route("**/chat", (route) => route.abort("connectionrefused"));
    await gotoAndOpenChat(page);
    await page.locator("[data-chat-input]").fill("What products do you have?");
    await page.locator("[data-chat-composer]").locator('button[type="submit"]').click();

    await expect(page.locator("[data-chat-messages]")).toContainText("Our AI assistant is temporarily unavailable");
    await expect(page.locator("[data-chat-input]")).toBeEnabled();
  });
});

test.describe("Chat widget: clear chat (Part N)", () => {
  test("Clear chat removes prior messages but keeps the welcome message, without resetting the server-confirmed remaining count", async ({ page }) => {
    await mockChatEndpoint(page, () => ({ reply: "Real answer.", remaining: 6 }));
    await gotoAndOpenChat(page);
    await page.locator("[data-chat-input]").fill("What products do you have?");
    await page.locator("[data-chat-composer]").locator('button[type="submit"]').click();
    await expect(page.locator("[data-chat-messages]")).toContainText("Real answer.");

    await page.locator('[data-action="clear-chat"]').click();
    await expect(page.locator("[data-chat-messages]")).not.toContainText("Real answer.");
    await expect(page.locator("[data-chat-welcome]")).toBeVisible();
    // Clearing the visible conversation never rewrites the server-
    // confirmed count still shown from the last real exchange.
    await expect(page.locator("[data-chat-status]")).toHaveText("6 replies remaining today");

    const stored = await page.evaluate(() => sessionStorage.getItem("seasonedz_chat_history"));
    expect(JSON.parse(stored || "[]")).toEqual([]);
  });
});

test.describe("Chat widget: accessibility and safety (Parts AB, U)", () => {
  test("the launcher is keyboard-reachable, opens the panel, and Escape closes it returning focus to the launcher", async ({ page }) => {
    await page.goto("/");
    await acceptCookiesIfShown(page);
    const launcher = page.locator(".chat-widget__launcher");
    await launcher.focus();
    await expect(launcher).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#seasonedzChatPanel")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("#seasonedzChatPanel")).toBeHidden();
    await expect(launcher).toBeFocused();
  });

  test("the close button has an accessible label and the panel has an accessible name", async ({ page }) => {
    await gotoAndOpenChat(page);
    await expect(page.locator('[data-action="close-chat-widget"]')).toHaveAttribute("aria-label", "Close chat");
    await expect(page.locator("#seasonedzChatPanel")).toHaveAttribute("aria-labelledby", "chatWidgetTitle");
  });

  test("AI output containing HTML-looking text is rendered as literal text, never executed", async ({ page }) => {
    await mockChatEndpoint(page, () => ({ reply: '<img src=x onerror="window.__xssFired = true">Still just text.', remaining: 6 }));
    await gotoAndOpenChat(page);
    await page.locator("[data-chat-input]").fill("test");
    await page.locator("[data-chat-composer]").locator('button[type="submit"]').click();

    await expect(page.locator("[data-chat-messages]")).toContainText("Still just text.");
    const xssFired = await page.evaluate(() => window.__xssFired === true);
    expect(xssFired).toBe(false);
    const hasImgElement = await page.evaluate(() => document.querySelectorAll("[data-chat-messages] img").length > 0);
    expect(hasImgElement).toBe(false);
  });

  test("mobile viewport: launcher stays visible and the page never scrolls horizontally", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await acceptCookiesIfShown(page);
    await expect(page.locator(".chat-widget__launcher")).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});

// Milestone 187A: mobile discovery bubble ("How can we help you?"),
// shown beside the launcher only at <=768px (components.css). Reuses
// the exact same [data-action="toggle-chat-widget"] delegated handler
// as the launcher itself — see js/app.js's own comment — so opening it
// needs no new click-handling test beyond confirming the panel opens.
test.describe("Chat widget: mobile discovery bubble (Milestone 187A)", () => {
  const bubble = "[data-chat-discovery-bubble]";

  test("appears on a normal public route at a mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await acceptCookiesIfShown(page);
    await expect(page.locator(bubble)).toBeVisible();
  });

  test("shows the exact required text, nothing else, and never a live-agent framing", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await acceptCookiesIfShown(page);
    await expect(page.locator(bubble)).toHaveText("How can we help you?");
    const bodyText = await page.locator(bubble).innerText();
    for (const forbidden of ["Online", "Live agent", "Someone is waiting", "Chat with us now"]) {
      expect(bodyText).not.toContain(forbidden);
    }
  });

  test("clicking the bubble opens the Seasonedz Assistant panel", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await stubTurnstile(page);
    await page.goto("/");
    await acceptCookiesIfShown(page);
    await page.locator(bubble).click();
    await expect(page.locator("#seasonedzChatPanel")).toBeVisible();
    await expect(page.locator("#chatWidgetTitle")).toHaveText("Seasonedz Assistant");
  });

  test("the bubble hides the moment the panel opens, and returns once it's closed again", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await stubTurnstile(page);
    await page.goto("/");
    await acceptCookiesIfShown(page);
    await expect(page.locator(bubble)).toBeVisible();

    await page.locator(bubble).click();
    await expect(page.locator("#seasonedzChatPanel")).toBeVisible();
    await expect(page.locator(bubble)).toBeHidden();

    await page.locator('[data-action="close-chat-widget"]').click();
    await expect(page.locator("#seasonedzChatPanel")).toBeHidden();
    await expect(page.locator(bubble)).toBeVisible();
  });

  test("hidden on a sensitive/private route, same as the rest of the widget", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/admin/login");
    await expect(page.locator("[data-chat-widget]")).toBeHidden();
    await expect(page.locator(bubble)).toBeHidden();
  });

  test("hidden while the cookie consent banner is still blocking the launcher", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    // Deliberately does NOT accept/dismiss the banner — the whole
    // widget, bubble included, must stay hidden underneath it.
    await expect(page.locator("[data-cookie-consent-banner]")).toBeVisible();
    await expect(page.locator("[data-chat-widget]")).toBeHidden();
    await expect(page.locator(bubble)).toBeHidden();
  });

  test("no horizontal overflow at 320px/375px/390px/430px with the bubble showing", async ({ page }) => {
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await acceptCookiesIfShown(page);
      await expect(page.locator(bubble)).toBeVisible();
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `width=${width}`).toBeLessThanOrEqual(clientWidth + 1);
    }
  });

  test("desktop stays uncluttered: the bubble never renders, only the existing plain launcher does", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await acceptCookiesIfShown(page);
    await expect(page.locator(".chat-widget__launcher")).toBeVisible();
    await expect(page.locator(bubble)).toBeHidden();
  });

  test("the bubble is a real, keyboard-reachable button with an accessible label — never colour-only affordance", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await stubTurnstile(page);
    await page.goto("/");
    await acceptCookiesIfShown(page);
    const bubbleLocator = page.locator(bubble);
    await expect(bubbleLocator).toHaveAttribute("aria-label", "Open Seasonedz Assistant");
    expect(await bubbleLocator.evaluate((el) => el.tagName)).toBe("BUTTON");

    await bubbleLocator.focus();
    await expect(bubbleLocator).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#seasonedzChatPanel")).toBeVisible();
  });
});
