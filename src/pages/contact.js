// Contact page: contact details plus a visual-only contact form.
// The form never sends anything — see the shared .demo-form submit
// handler in js/app.js, which reveals a friendly "demo only" message
// instead of actually submitting.

import { renderEnquiryForm } from "../components/enquiryForm.js";

export function renderContact() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Contact Us</h1>
      <p class="stub-page__text">
        Have a question about our products, or interested in schools and
        wholesale orders? We'd love to hear from you.
      </p>

      <div class="contact-layout">
        <div class="contact-details">
          <div class="contact-detail">
            <span class="contact-detail__icon" aria-hidden="true">&#9993;</span>
            <div>
              <h3>Email</h3>
              <p>hello@seasonedzgroup.com</p>
            </div>
          </div>
          <div class="contact-detail">
            <span class="contact-detail__icon" aria-hidden="true">&#128241;</span>
            <div>
              <h3>WhatsApp</h3>
              <p>+27 00 000 0000 <span class="contact-detail__note">(coming soon)</span></p>
            </div>
          </div>
          <div class="contact-detail">
            <span class="contact-detail__icon" aria-hidden="true">&#128222;</span>
            <div>
              <h3>Phone</h3>
              <p>+27 00 000 0000</p>
            </div>
          </div>
          <div class="contact-detail">
            <span class="contact-detail__icon" aria-hidden="true">&#128205;</span>
            <div>
              <h3>Location</h3>
              <p>South Africa</p>
            </div>
          </div>
        </div>

        ${renderEnquiryForm({ heading: "Send Us a Message", ctaText: "Send Message", idPrefix: "contact" })}
      </div>
    </section>
  `;
}
