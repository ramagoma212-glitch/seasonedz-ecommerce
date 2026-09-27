// Reusable enquiry form: used by the Contact, Schools, Wholesale and
// Distributor pages, which all need essentially the same
// name/organisation/email/message shape. Submits to the backend
// Enquiry API (POST /api/enquiries) — see the shared ".demo-form"
// submit handler in js/app.js, which reads `type` from
// data-enquiry-type below to tell the four forms apart.

// Milestone 198.2 pre-launch audit fix, Part 26: the backend Enquiry
// model already has an unused, nullable `province` column (see
// backend/prisma/schema.prisma) that no enquiry form populated —
// zero-migration, frontend-only addition. Uses the same 9-province
// list as checkoutPage.js's own province select.
const PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
];

export function renderEnquiryForm({
  heading,
  orgLabel,
  orgPlaceholder,
  orgRequired = false,
  ctaText = "Send Enquiry",
  idPrefix = "enquiry",
  type,
  showQuantityField = false,
  quantityRequired = false,
  showProvinceField = false,
}) {
  return `
    <form class="contact-form demo-form" data-enquiry-type="${type}" novalidate>
      <h3>${heading}</h3>

      <div class="form-field">
        <label class="form-field__label" for="${idPrefix}Name">Name<span class="form-field__required" aria-hidden="true"> *</span></label>
        <input type="text" id="${idPrefix}Name" name="name" class="form-field__input" required />
        <span class="form-field__error" data-error-for="name"></span>
      </div>

      ${
        orgLabel
          ? `
            <div class="form-field">
              <label class="form-field__label" for="${idPrefix}Org">
                ${orgLabel}${orgRequired ? '<span class="form-field__required" aria-hidden="true"> *</span>' : ""}
              </label>
              <input
                type="text"
                id="${idPrefix}Org"
                name="companyName"
                class="form-field__input"
                placeholder="${orgPlaceholder || ""}"
                ${orgRequired ? "required" : ""}
              />
              <span class="form-field__error" data-error-for="companyName"></span>
            </div>
          `
          : ""
      }

      <div class="form-field">
        <label class="form-field__label" for="${idPrefix}Email">Email<span class="form-field__required" aria-hidden="true"> *</span></label>
        <input type="email" id="${idPrefix}Email" name="email" class="form-field__input" required />
        <span class="form-field__error" data-error-for="email"></span>
      </div>

      ${
        showQuantityField
          ? `
            <div class="form-field">
              <label class="form-field__label" for="${idPrefix}Quantity">
                Estimated Quantity
                ${quantityRequired ? '<span class="form-field__required" aria-hidden="true"> *</span>' : '<span class="form-field__optional">(optional)</span>'}
              </label>
              <input
                type="number"
                id="${idPrefix}Quantity"
                name="estimatedQuantity"
                class="form-field__input"
                min="1"
                step="1"
                placeholder="e.g. 50"
                ${quantityRequired ? "required" : ""}
              />
              <span class="form-field__error" data-error-for="estimatedQuantity"></span>
            </div>
          `
          : ""
      }

      ${
        showProvinceField
          ? `
            <div class="form-field">
              <label class="form-field__label" for="${idPrefix}Province">Province <span class="form-field__optional">(optional)</span></label>
              <select id="${idPrefix}Province" name="province" class="form-field__input">
                <option value="">Select a province</option>
                ${PROVINCES.map((province) => `<option value="${province}">${province}</option>`).join("")}
              </select>
              <span class="form-field__error" data-error-for="province"></span>
            </div>
          `
          : ""
      }

      <div class="form-field">
        <label class="form-field__label" for="${idPrefix}Message">Message<span class="form-field__required" aria-hidden="true"> *</span></label>
        <textarea id="${idPrefix}Message" name="message" class="form-field__input form-field__textarea" rows="4" required></textarea>
        <span class="form-field__error" data-error-for="message"></span>
      </div>

      <div class="form-banner form-banner--error" data-enquiry-banner hidden></div>

      <button type="submit" class="btn btn--primary btn--block">${ctaText}</button>

      <p class="demo-form__result" hidden></p>
    </form>
  `;
}
