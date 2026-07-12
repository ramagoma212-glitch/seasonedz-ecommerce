// Terms and conditions page. Practical, plain-language wording for a
// frontend demo site — not formal legal advice.

export function renderTerms() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Terms &amp; Conditions</h1>
      <p class="stub-page__text">
        The basics of using this website and shopping with Seasonedz Group.
      </p>

      <div class="info-page__body policy-page">
        <p>
          These terms are written in plain language to explain how this
          website currently works. They aren't intended as formal legal
          advice, and will be expanded as the site grows.
        </p>

        <h2>Using This Website</h2>
        <p>
          This website is provided so you can browse and learn about
          Seasonedz Group's products, and — currently as a demo — try out
          the shopping and checkout experience.
        </p>

        <h2>Product Information</h2>
        <p>
          We try to describe our products accurately, including images,
          pricing and age recommendations. Occasionally details may change
          as our range is updated.
        </p>

        <h2>Pricing</h2>
        <p>
          Prices are shown in South African Rand (ZAR) and may change from
          time to time. The price shown at checkout is the price that
          applies to your order.
        </p>

        <h2>Orders and Demo Checkout</h2>
        <p>
          This site's checkout is currently a <strong>frontend demonstration
          only</strong>. Orders placed here are saved to your browser's
          Local Storage for preview purposes — no real payment is taken and
          no goods are shipped.
        </p>

        <h2>Future Payment Processing</h2>
        <p>
          Once real online payment (including PayFast) is connected, these
          terms will be updated to cover payment processing, order
          confirmation and related terms in full.
        </p>

        <h2>Delivery</h2>
        <p>
          See our <a href="#/shipping-policy">Shipping Policy</a> for
          delivery fees and general timing guidance.
        </p>

        <h2>Returns</h2>
        <p>
          See our <a href="#/returns-policy">Returns Policy</a> for
          guidance on damaged, incorrect or unwanted items.
        </p>

        <h2>Limitation of Liability</h2>
        <p>
          We aim to keep this website accurate and running smoothly, but we
          can't guarantee it will always be error-free or uninterrupted. We
          are not liable for issues arising from use of this demo site
          beyond what is required by law.
        </p>

        <h2>Contact</h2>
        <p>
          If you have questions about these terms, please
          <a href="#/contact">contact us</a>.
        </p>
      </div>
    </section>
  `;
}
