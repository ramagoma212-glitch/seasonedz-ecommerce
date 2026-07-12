// Cookies policy page. This site doesn't actually use tracking
// cookies — it uses browser Local Storage for cart/wishlist/demo
// orders — so this page explains that plainly rather than describing
// cookie technology that isn't in use.

export function renderCookiesPolicy() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Cookies Policy</h1>
      <p class="stub-page__text">
        A simple explanation of how this site remembers your cart and preferences.
      </p>

      <div class="info-page__body policy-page">
        <h2>Cookies and Local Storage</h2>
        <p>
          This website doesn't currently use tracking cookies. Instead, it
          uses your browser's <strong>Local Storage</strong> — a simple way
          for a website to remember information on your own device, without
          sending it anywhere else.
        </p>

        <h2>What We Store</h2>
        <ul>
          <li><strong>Cart:</strong> the items you've added, so they're still there if you refresh the page.</li>
          <li><strong>Wishlist:</strong> products you've saved for later.</li>
          <li><strong>Demo orders:</strong> any orders placed through our demo checkout, so you can view them on the order confirmation and tracking pages.</li>
        </ul>

        <h2>Looking Ahead</h2>
        <p>
          As this site grows, we may introduce analytics tools to understand
          how the site is used and improve it. If that happens, this page
          will be updated to explain what's collected and why.
        </p>

        <h2>Clearing Your Browser Storage</h2>
        <p>
          You're always in control of this information. You can clear your
          cart, wishlist and demo orders at any time by clearing your
          browser's site data or Local Storage for this website — usually
          available in your browser's settings under "Privacy" or "Site
          Data".
        </p>
      </div>
    </section>
  `;
}
