// Site footer component: a light support strip (FAQ/WhatsApp/Email/
// Phone), logo + description column, three link groups (General /
// Orders & Support / Account), a grid of individually-presented
// payment method logos, a divider and the copyright line.
//
// Version 7, Milestone 171B.0.2: rebuilt to match an owner-supplied
// reference layout (structure/spacing/proportions only — no wording,
// branding or copy from that reference was copied; every link, contact
// detail and the copyright line below are Seasonedz Group's own real,
// pre-existing information). Replaces the previous four-group layout
// (Help / Seasonedz Group / Legal / Contact Us) and the single combined
// payment-logos image with individually cropped logo assets
// (public/images/payment/) laid out in their own grid. The combined
// image (images/payment-methods-payfast.webp) is untouched and still
// used as-is by the checkout trust panel and product page (Part 18 of
// the brief: this milestone is footer-only).
import { withBase } from "../js/paths.js";
import { businessInfo } from "../data/businessInfo.js";

const PAYMENT_LOGOS = [
  { name: "visa", label: "Visa" },
  { name: "mastercard", label: "Mastercard" },
  { name: "apple-pay", label: "Apple Pay" },
  { name: "google-pay", label: "Google Pay" },
  { name: "samsung-pay", label: "Samsung Pay" },
  { name: "instant-eft", label: "Instant EFT by PayFast" },
  { name: "snapscan", label: "SnapScan" },
  { name: "zapper", label: "Zapper" },
  { name: "payflex", label: "Payflex" },
];

function renderPaymentLogo({ name, label }) {
  return `
    <span class="footer-payment-grid__item">
      <img
        src="${withBase(`/images/payment/payment-${name}.webp`)}"
        alt="${label}"
        loading="lazy"
        decoding="async"
      />
    </span>
  `;
}

export function renderFooter() {
  const year = new Date().getFullYear();

  return `
    <footer class="site-footer">
      <div class="footer-support-strip">
        <div class="container footer-support-strip__inner">
          <a class="footer-support-strip__item" href="/faq">
            <span class="footer-support-strip__icon" aria-hidden="true">&#10067;</span>
            FAQ
          </a>
          <a class="footer-support-strip__item" href="${businessInfo.whatsappUrl}" target="_blank" rel="noopener noreferrer">
            <span class="footer-support-strip__icon" aria-hidden="true">&#128172;</span>
            WhatsApp Us
          </a>
          <a class="footer-support-strip__item" href="${businessInfo.mailtoUrl}">
            <span class="footer-support-strip__icon" aria-hidden="true">&#9993;</span>
            ${businessInfo.email}
          </a>
          <a class="footer-support-strip__item" href="${businessInfo.telUrl}">
            <span class="footer-support-strip__icon" aria-hidden="true">&#128222;</span>
            ${businessInfo.phoneDisplay}
          </a>
        </div>
      </div>

      <div class="container site-footer__inner">
        <div class="site-footer__col site-footer__col--brand">
          <a href="/" class="logo footer-logo">
            <img src="${withBase("/images/logo-placeholder.jpeg")}" alt="Seasonedz Group logo" width="40" height="40" loading="lazy" decoding="async" />
            <span class="logo__text">Seasonedz</span>
          </a>
          <p class="footer-description">
            Educational colouring books, Bible colouring books, mindfulness
            colouring books, markers, crayons and educational products for
            parents, teachers, schools and churches.
          </p>
          <a class="footer-newsletter-shortcut" href="/">Get Free Pages &amp; Updates</a>
        </div>

        <div class="site-footer__col">
          <h4 class="footer-heading">General</h4>
          <ul class="footer-links">
            <li><a href="/about">About Us</a></li>
            <li><a href="/schools">Schools &amp; Churches</a></li>
            <li><a href="/faq">FAQ</a></li>
            ${
              businessInfo.googleReviewRequestUrl
                ? `<li><a href="${businessInfo.googleReviewRequestUrl}" target="_blank" rel="noopener noreferrer" aria-label="Leave a Google review for Seasonedz Group (opens in a new tab)">Review us on Google</a></li>`
                : ""
            }
          </ul>
        </div>

        <div class="site-footer__col">
          <h4 class="footer-heading">Orders &amp; Support</h4>
          <ul class="footer-links">
            <li><a href="/shipping-policy">Delivery Information</a></li>
            <li><a href="/returns-policy">Returns Policy</a></li>
            <li><a href="/terms">Terms &amp; Conditions</a></li>
            <li><a href="/privacy-policy">Privacy Policy</a></li>
            <li><a href="/track-order">Track Order</a></li>
          </ul>
        </div>

        <div class="site-footer__col">
          <h4 class="footer-heading">Account</h4>
          <ul class="footer-links">
            <li><a href="/account">My Account</a></li>
            <li><a href="/wishlist">Wishlist</a></li>
          </ul>
        </div>
      </div>

      <div class="container footer-payment">
        <p class="footer-payment__heading">We Accept</p>
        <div class="footer-payment-grid">
          ${PAYMENT_LOGOS.map(renderPaymentLogo).join("")}
        </div>
      </div>

      <div class="container">
        <div class="footer-divider"></div>
      </div>

      <div class="site-footer__bottom">
        &copy; ${year} Seasonedz Group. All rights reserved.
      </div>
    </footer>
  `;
}
