// Reusable demo enquiry form: used by the Contact, Schools, Wholesale
// and Distributor pages, which all need essentially the same
// name/organisation/email/message shape. None of these forms actually
// send anything — see the shared .demo-form submit handler in
// js/app.js, which reveals the message below instead of submitting.

export function renderEnquiryForm({ heading, orgLabel, orgPlaceholder, ctaText = "Send Enquiry", idPrefix = "enquiry" }) {
  return `
    <form class="contact-form demo-form" novalidate>
      <h3>${heading}</h3>

      <div class="form-field">
        <label class="form-field__label" for="${idPrefix}Name">Name<span class="form-field__required" aria-hidden="true"> *</span></label>
        <input type="text" id="${idPrefix}Name" name="name" class="form-field__input" required />
      </div>

      ${
        orgLabel
          ? `
            <div class="form-field">
              <label class="form-field__label" for="${idPrefix}Org">${orgLabel}</label>
              <input type="text" id="${idPrefix}Org" name="organisation" class="form-field__input" placeholder="${orgPlaceholder || ""}" />
            </div>
          `
          : ""
      }

      <div class="form-field">
        <label class="form-field__label" for="${idPrefix}Email">Email<span class="form-field__required" aria-hidden="true"> *</span></label>
        <input type="email" id="${idPrefix}Email" name="email" class="form-field__input" required />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="${idPrefix}Message">Message<span class="form-field__required" aria-hidden="true"> *</span></label>
        <textarea id="${idPrefix}Message" name="message" class="form-field__input form-field__textarea" rows="4" required></textarea>
      </div>

      <button type="submit" class="btn btn--primary btn--block">${ctaText}</button>

      <p class="demo-form__result" hidden>
        Thank you. This demo form does not send messages yet. Please
        contact Seasonedz Group directly using our
        <a href="#/contact">Contact page</a> while backend email support
        is being prepared.
      </p>
    </form>
  `;
}
