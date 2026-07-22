// Privacy policy page. Plain-language explanation of how this website
// actually handles information: cart and wishlist stay in the
// customer's own browser (Local Storage), while order and delivery
// details submitted at checkout are sent to and stored on the real
// Seasonedz Group backend so orders can be processed. Not formal
// legal advice.

export function renderPrivacyPolicy() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Privacy Policy</h1>
      <p class="stub-page__text">
        How we handle information on this site, explained simply.
      </p>

      <div class="info-page__body policy-page">
        <p>
          This page explains, in plain language, how information is
          handled on this website. It's written to be practical and
          honest about how this site currently works. It isn't intended
          as formal legal advice.
        </p>

        <h2>Information Collected at Checkout</h2>
        <p>
          When you place an order, we collect the details needed to
          process it: your name, email address, phone number and
          delivery address. This information is only used to process,
          confirm and deliver your order, and to contact you if needed.
        </p>

        <h2>How Your Information Is Stored</h2>
        <p>
          Your cart and wishlist are stored only in your own browser,
          using Local Storage. This information stays on your device
          until you complete an order. See our
          <a href="/cookies-policy">Cookies Policy</a> for more detail.
        </p>
        <p>
          When you place an order, your order details, including your
          customer and delivery information, are sent securely to the
          Seasonedz Group website backend and stored there. This allows
          Seasonedz Group to confirm your order, arrange delivery and
          keep a record for order management.
        </p>

        <h2>Payment Information</h2>
        <p>
          Seasonedz Group currently accepts orders by Bank Transfer and
          Cash or Card on Delivery. Neither method takes an online
          payment through this website. Online payment through PayFast
          is being prepared but is not available to customers yet. Once
          PayFast is enabled, this policy will be updated to explain
          what information is shared with PayFast to process a payment.
        </p>

        <h2>Your Privacy Matters to Us</h2>
        <p>
          We only ever intend to use your information to serve you
          better: processing orders, arranging delivery, responding to
          enquiries and improving this site. If you have any questions
          about your information, please
          <a href="/contact">contact us</a>.
        </p>
      </div>
    </section>
  `;
}
