// Distributor page: speaks to potential distributors interested in
// carrying the Seasonedz Group range more broadly than a single store.

import { renderEnquiryForm } from "../components/enquiryForm.js";
import { renderContactSupportNote } from "../components/contactSupportNote.js";

export function renderDistributor() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Become a Distributor</h1>
      <p class="stub-page__text">
        Interested in distributing Seasonedz Group products more widely?
        We'd like to hear from you.
      </p>

      <div class="info-page__body">
        <h2>About Seasonedz Group</h2>
        <p>
          Seasonedz Group creates educational colouring books, Bible
          colouring books, mindfulness colouring books, markers, crayons
          and bundled gift sets for parents, teachers, schools and churches
          across South Africa.
        </p>

        <h2>Our Range</h2>
        <p>
          Our current product range spans kids' educational colouring
          books, faith-based colouring books, adult mindfulness colouring,
          and the markers and crayons that go with them — with new products
          added as we grow.
        </p>

        <h2>Who Distribution Is For</h2>
        <p>
          We're looking to hear from distributors who can help get our
          products into more schools, bookstores, church shops and retail
          outlets, particularly across regions we don't yet reach directly.
        </p>

        <h2>What We're Looking For</h2>
        <ul>
          <li>Established distribution networks in education, retail or Christian bookstores</li>
          <li>A shared interest in educational and faith-based products</li>
          <li>Reliable logistics and communication</li>
        </ul>

        <div class="demo-notice">
          <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
          <div>
            <strong>Applications Reviewed Manually</strong>
            <p>
              Every distributor enquiry is reviewed personally by the
              Seasonedz Group team — there's no automated approval process.
              We'll respond directly once we've had a chance to review your
              enquiry.
            </p>
          </div>
        </div>

        ${renderContactSupportNote("Prefer to reach us directly?")}
      </div>

      ${renderEnquiryForm({
        heading: "Distributor Enquiry",
        orgLabel: "Company Name",
        orgPlaceholder: "e.g. Sunnyside Distribution",
        orgRequired: true,
        ctaText: "Send Enquiry",
        idPrefix: "distributor",
        type: "DISTRIBUTOR",
      })}
    </section>
  `;
}
