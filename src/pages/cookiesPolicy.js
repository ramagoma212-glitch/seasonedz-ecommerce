// Cookies policy page. This site doesn't use tracking cookies — it
// uses browser Local Storage for cart, wishlist and a small order
// reference, while real order and delivery details are sent to and
// stored on the Seasonedz Group website backend once an order is
// placed. This page explains that plainly.

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
          uses your browser's <strong>Local Storage</strong>, a simple way
          for a website to remember information on your own device, without
          sending it anywhere else.
        </p>

        <h2>What We Store On Your Device</h2>
        <ul>
          <li><strong>Cart:</strong> the items you've added, so they're still there if you refresh the page.</li>
          <li><strong>Wishlist:</strong> products you've saved for later.</li>
          <li><strong>Order reference:</strong> a small reference to your most recent order, such as the order number, so we can show you the right order confirmation and tracking information.</li>
        </ul>

        <h2>What Is Sent to Seasonedz Group</h2>
        <p>
          When you place an order, your order details, including your
          customer and delivery information, are sent to and stored on
          the Seasonedz Group website backend so your order can be
          processed. See our <a href="/privacy-policy">Privacy Policy</a>
          for more detail on how that information is used.
        </p>

        <h2>Looking Ahead</h2>
        <p>
          As this site grows, we may introduce analytics tools to understand
          how the site is used and improve it. If that happens, this page
          will be updated to explain what's collected and why.
        </p>

        <h2>Clearing Your Browser Storage</h2>
        <p>
          You're always in control of the information stored on your
          device. You can clear your cart, wishlist and order reference
          at any time by clearing your browser's site data or Local
          Storage for this website, usually available in your browser's
          settings under "Privacy" or "Site Data". Clearing this will
          not affect any order already confirmed with Seasonedz Group.
        </p>
      </div>
    </section>
  `;
}
