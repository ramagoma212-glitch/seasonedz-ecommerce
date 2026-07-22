// Terms and conditions page. Practical, plain-language wording for
// how this website actually works today — not formal legal advice.

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
          This website is provided so you can browse Seasonedz Group's
          products and place an order using our current checkout process.
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

        <h2>Placing an Order</h2>
        <p>
          When you place an order, it is sent to Seasonedz Group for
          processing. You can currently pay using Bank Transfer or Cash
          or Card on Delivery. Both place a real order with Seasonedz
          Group. Seasonedz Group confirms your order, payment and stock
          availability before your order is prepared for delivery.
        </p>

        <h2>Online Payment</h2>
        <p>
          Online payment through PayFast is being prepared but is not
          available to customers yet. Once PayFast is enabled, these
          terms will be updated to cover online payment processing in
          full.
        </p>

        <h2>Delivery</h2>
        <p>
          See our <a href="/shipping-policy">Shipping Policy</a> for
          delivery fees and general timing guidance.
        </p>

        <h2>Returns</h2>
        <p>
          See our <a href="/returns-policy">Returns Policy</a> for
          guidance on damaged, incorrect or unwanted items.
        </p>

        <h2>Limitation of Liability</h2>
        <p>
          We aim to keep this website accurate and running smoothly, but we
          can't guarantee it will always be error-free or uninterrupted. We
          are not liable for issues arising from use of this website
          beyond what is required by law.
        </p>

        <h2>Contact</h2>
        <p>
          If you have questions about these terms, please
          <a href="/contact">contact us</a>.
        </p>
      </div>
    </section>
  `;
}
