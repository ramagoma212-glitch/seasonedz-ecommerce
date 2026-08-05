// Version 7, Milestone 150: homepage newsletter signup.
// Version 7, Milestone 168F: connected to a real subscriber endpoint
// (POST /api/newsletter/subscribe, see js/api/newsletterApi.js and the
// submit handler in js/app.js) — replaces the old permanent "not
// available yet" message with a genuine subscription workflow.
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

          <!-- Honeypot: real visitors never see or fill this in (see
               its CSS in components.css). A filled value marks the
               submission as spam server-side — see
               newsletter.validator.ts's own comment. -->
          <div class="newsletter-form__honeypot" aria-hidden="true">
            <label for="newsletter-website">Website</label>
            <input type="text" id="newsletter-website" name="website" tabindex="-1" autocomplete="off" />
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
