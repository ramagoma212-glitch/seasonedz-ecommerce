// Privacy policy page. Written in plain language for a frontend demo
// site — this describes what actually happens in the code (Local
// Storage only, no server), not formal legal advice.

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
          honest about how this site currently works — it isn't intended
          as formal legal advice.
        </p>

        <h2>Information Collected at Checkout</h2>
        <p>
          When you use our guest checkout, we collect the details needed to
          process an order: your name, email address, phone number and
          delivery address. This information is only used to fulfil and
          communicate about your order.
        </p>

        <h2>How This Demo Site Stores Information</h2>
        <p>
          This website is currently a frontend demo with no backend server
          or database. Your cart, wishlist and any demo orders you place
          are stored only in your own browser's Local Storage — nothing is
          sent to us or anyone else. Clearing your browser storage will
          remove this information. See our
          <a href="#/cookies-policy">Cookies Policy</a> for more detail.
        </p>

        <h2>Looking Ahead</h2>
        <p>
          Once real accounts and payment processing are introduced, this
          policy will be updated to explain how that information is stored
          and protected, including any third-party services involved (such
          as a payment provider).
        </p>

        <h2>Your Privacy Matters to Us</h2>
        <p>
          We only ever intend to use your information to serve you better —
          processing orders, responding to enquiries, and improving this
          site. If you have any questions about your information, please
          <a href="#/contact">contact us</a>.
        </p>
      </div>
    </section>
  `;
}
