// Version 7, Milestone 150: homepage newsletter signup. No subscriber
// endpoint exists anywhere in this backend (checked: no Subscriber
// Prisma model, no /api/newsletter or /api/subscribe route) — per the
// brief's own explicit instruction, this never pretends to work: no
// silent localStorage save, no fake success message, no backend added
// in this homepage-only milestone. The full accessible UI is built
// and submission is intercepted in js/app.js to show an honest
// "not available yet" message instead of silently doing nothing.
export function renderNewsletterSection() {
  return `
    <section class="section container">
      <div class="newsletter-section">
        <div class="section__header">
          <h2>Free Pages and Fresh Updates</h2>
          <p>Join the Seasonedz Group community for new releases, product updates and free printable colouring pages.</p>
        </div>

        <form class="newsletter-form" data-newsletter-form novalidate>
          <div class="newsletter-form__fields">
            <div class="form-field">
              <label class="form-field__label" for="newsletter-name">Your name</label>
              <input type="text" id="newsletter-name" name="name" class="form-field__input" autocomplete="name" required />
            </div>
            <div class="form-field">
              <label class="form-field__label" for="newsletter-email">Your email address</label>
              <input type="email" id="newsletter-email" name="email" class="form-field__input" autocomplete="email" required />
            </div>
          </div>

          <button type="submit" class="btn btn--primary">Send Me Updates</button>

          <p class="newsletter-form__consent">
            By subscribing, you agree to receive emails from Seasonedz Group. You can unsubscribe at any time.
          </p>

          <p class="newsletter-form__message" data-newsletter-message role="status" hidden></p>
        </form>
      </div>
    </section>
  `;
}
