// Cookies policy page (rewritten Version 7, Milestone 171H to reflect
// a real, current audit of this codebase, replacing an older version
// written before customer accounts/social login/PayFast existed). See
// js/consent.js's own header comment for the full technical inventory
// this page's content is based on — nothing here is invented.
//
// "Cookie Settings" reopens the same preferences manager the consent
// banner uses (js/app.js's openCookiePreferences()) — a real <button>,
// not a dead link, wired the same way as the footer's own equivalent
// link (components/footer.js).

export function renderCookiesPolicy() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Cookie Policy</h1>
      <p class="stub-page__text">
        What cookies and similar technologies Seasonedz Group actually uses, and how to control them.
      </p>

      <div class="info-page__body policy-page">
        <h2>What This Page Covers</h2>
        <p>
          "Cookies and similar technologies" covers both real browser
          cookies and your browser's Local Storage — a similar way for
          a website to remember information on your own device. This
          page explains exactly what Seasonedz Group uses, honestly and
          without exaggeration.
        </p>

        <h2>Strictly Necessary</h2>
        <p>
          These keep the site working securely and can't be switched
          off — they're only ever used for the service you've actually
          asked for (browsing, signing in, checking out).
        </p>
        <ul>
          <li><strong>Session cookies</strong> (<code>customer_session</code>, and <code>admin_session</code> for staff): keep you signed in to your account securely. Set directly by our server, HttpOnly (never readable by any script), and expire after 7 days or when you log out.</li>
          <li><strong>Sign-in security cookie</strong> (<code>oauth_state</code>): used only during the few seconds of a "Continue with Google" or "Continue with Facebook" sign-in, to protect that process from being hijacked. Expires after 10 minutes.</li>
          <li><strong>Cart</strong> and <strong>Wishlist</strong> (Local Storage): remembers the items you've added, so they're still there if you refresh the page or come back later. This is stored only on your own device.</li>
          <li><strong>Recent order reference</strong> (Local Storage): a small, non-sensitive note of your most recent order number, so we can show you the right confirmation page after checkout. Expires automatically after 24 hours.</li>
          <li><strong>Your cookie preference</strong> (Local Storage): remembers the choice you make below, so we don't ask you again every visit.</li>
        </ul>

        <h2>Analytics and Marketing</h2>
        <p>
          Seasonedz Group does not currently use any analytics or
          marketing cookies — no Google Analytics, no advertising
          pixels, no third-party trackers of any kind. The choices
          below for these categories exist so you're in control from
          day one, in case that ever changes; nothing is switched on
          behind the scenes. If we do introduce analytics or marketing
          tools in future, this page will be updated first to explain
          exactly what's added and why, and you'll be asked again for
          consent.
        </p>

        <h2>Your Choices</h2>
        <p>
          When you first visit, a banner lets you Accept All, Reject
          Non-essential, or open Manage Preferences to choose per
          category. Strictly necessary items are always on, since the
          site can't function securely without them. You can change
          your mind at any time — use the
          <button type="button" class="link-button" data-action="cookie-manage">Cookie Settings</button>
          button here, or in the footer of any page.
        </p>
        <p>
          Your saved choice is kept for up to 6 months, after which
          you'll be asked again — or sooner, if the categories on this
          page ever materially change.
        </p>

        <h2>What Is Sent to Seasonedz Group</h2>
        <p>
          When you place an order, your order details, including your
          customer and delivery information, are sent to and stored on
          the Seasonedz Group website backend so your order can be
          processed. See our <a href="/privacy-policy">Privacy Policy</a>
          for more detail on how that information is used.
        </p>

        <h2>Questions</h2>
        <p>
          If you have any questions about cookies, Local Storage, or
          your privacy on this site, please
          <a href="/contact">contact us</a>.
        </p>
      </div>
    </section>
  `;
}
