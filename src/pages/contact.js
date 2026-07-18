// Contact page: contact details plus the shared enquiry form, submitted
// to the backend Enquiry API as a CONTACT-type enquiry — see the
// shared .demo-form submit handler in js/app.js.

import { renderEnquiryForm } from "../components/enquiryForm.js";
import { businessInfo } from "../data/businessInfo.js";

export function renderContact() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Contact Us</h1>
      <p class="stub-page__text">
        Have a question about our products, or interested in schools and
        wholesale orders? We'd love to hear from you.
      </p>

      <div class="info-page__body">
        <h2>How We Can Help</h2>
        <ul>
          <li><strong>General product questions</strong>, such as what a colouring book includes or which age it suits.</li>
          <li><strong>Order support</strong>, including help with an order you've already placed.</li>
          <li><strong>Delivery support</strong>, such as a delivery address that needs to be corrected. See our <a href="#/shipping-policy">Shipping Policy</a> for the R80 / free from R700 delivery rule.</li>
          <li><strong>School orders</strong>, for preschools, primary schools and classrooms. See our <a href="#/schools">Schools page</a> for more detail.</li>
          <li><strong>Wholesale and bulk enquiries</strong>, for retailers and bulk buyers. See our <a href="#/wholesale">Wholesale page</a> for more detail.</li>
          <li><strong>Distributor interest</strong>. See our <a href="#/distributor">Distributor page</a> for more detail.</li>
        </ul>

        <h2>What to Include</h2>
        <p>Including a few details helps us respond faster:</p>
        <ul>
          <li>Your name</li>
          <li>The best way to reach you, your email or a WhatsApp number</li>
          <li>Your product or order question</li>
          <li>The quantity needed, for bulk or school orders</li>
          <li>Your delivery area, if your question is about delivery</li>
        </ul>
      </div>

      <div class="contact-layout">
        <div class="contact-details">
          <div class="contact-detail">
            <span class="contact-detail__icon" aria-hidden="true">&#9993;</span>
            <div>
              <h3>Email</h3>
              <p><a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a></p>
            </div>
          </div>
          <div class="contact-detail">
            <span class="contact-detail__icon" aria-hidden="true">&#128241;</span>
            <div>
              <h3>WhatsApp</h3>
              <p><a href="${businessInfo.whatsappUrl}" target="_blank" rel="noopener noreferrer">${businessInfo.phoneDisplay}</a></p>
            </div>
          </div>
          <div class="contact-detail">
            <span class="contact-detail__icon" aria-hidden="true">&#128222;</span>
            <div>
              <h3>Phone</h3>
              <p><a href="${businessInfo.telUrl}">${businessInfo.phoneDisplay}</a></p>
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

        ${renderEnquiryForm({ heading: "Send Us a Message", ctaText: "Send Message", idPrefix: "contact", type: "CONTACT" })}
      </div>
    </section>
  `;
}
