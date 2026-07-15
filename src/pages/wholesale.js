// Wholesale page: speaks to bookshops, educational stores, church
// shops, stationery stores, market sellers and corporate gifting buyers.

import { renderEnquiryForm } from "../components/enquiryForm.js";

export function renderWholesale() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Wholesale</h1>
      <p class="stub-page__text">
        Stock Seasonedz Group colouring books and creative supplies in your
        store, church shop or gift range.
      </p>

      <div class="info-page__body">
        <h2>Wholesale Partnerships</h2>
        <p>
          We're interested in working with retailers who share our love of
          educational and faith-based colouring products. If you'd like to
          stock our range, we'd love to hear from you.
        </p>

        <h2>Our Range</h2>
        <p>
          Our current range includes kids' educational colouring books,
          Bible colouring books, mindfulness colouring books for adults,
          markers, crayons and bundled gift sets — with more products
          planned as the range grows.
        </p>

        <h2>Who We Welcome Enquiries From</h2>
        <ul>
          <li>Bookshops</li>
          <li>Educational and toy stores</li>
          <li>Church shops and Christian bookstores</li>
          <li>Stationery stores</li>
          <li>Market sellers</li>
          <li>Corporate gifting buyers</li>
        </ul>

        <h2>Request a Quote</h2>
        <p>
          Every wholesale enquiry is different, so we don't publish a fixed
          price list — instead, tell us what you're interested in using the
          form below, and we'll follow up with a custom quote.
        </p>
      </div>

      ${renderEnquiryForm({
        heading: "Wholesale Enquiry",
        orgLabel: "Business Name",
        orgPlaceholder: "e.g. Sunnyside Books",
        orgRequired: true,
        ctaText: "Request a Quote",
        idPrefix: "wholesale",
        type: "WHOLESALE",
        showQuantityField: true,
        quantityRequired: true,
      })}
    </section>
  `;
}
