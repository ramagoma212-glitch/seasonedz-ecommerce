// Site footer component: a light support strip (FAQ/WhatsApp/Email/
// Phone), then one main row with four sections — General / Orders &
// Support / Account / Payment Methods — a divider and the copyright
// line.
//
// Version 7, Milestone 171B.0.3: owner-directed layout refinement of
// the 171B.0.2 footer (structure/spacing only, still visual-inspiration
// only from the previously supplied reference — no wording, branding
// or copy from that reference was ever copied). Changes from 171B.0.2:
// the old separate brand/logo/description column is gone (Part 6 —
// that copy still exists elsewhere on the site, e.g. the About page,
// this just removes the footer's own copy of it); "Contact Us" is no
// longer a removed column but a link inside Account; and the payment
// logos move from a full-width strip below the columns into their own
// fourth column, arranged in two explicit rows (major card/wallet
// brands, then South African local payment methods) instead of one
// auto-wrapping grid. The combined image
// (images/payment-methods-payfast.webp) is untouched and still used
// as-is by the checkout trust panel and product page (Part 18 of the
// brief: this milestone is footer-only) — the individual logo assets
// used here (public/images/payment/) are unchanged from 171B.0.2.
import { withBase } from "../js/paths.js";
import { businessInfo } from "../data/businessInfo.js";

// Split into two rows for the desktop/tablet column layout: major
// global card/wallet brands first, then South African local payment
// methods — also groups logos with similar (taller/squarer vs.
// flatter/wider) natural aspect ratios together, which reads more
// evenly than an unordered auto-wrapping grid would.
const PAYMENT_LOGO_ROWS = [
  [
    { name: "visa", label: "Visa" },
    { name: "mastercard", label: "Mastercard" },
    { name: "apple-pay", label: "Apple Pay" },
    { name: "google-pay", label: "Google Pay" },
    { name: "samsung-pay", label: "Samsung Pay" },
  ],
  [
    { name: "instant-eft", label: "Instant EFT by PayFast" },
    { name: "snapscan", label: "SnapScan" },
    { name: "zapper", label: "Zapper" },
    { name: "payflex", label: "Payflex" },
  ],
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

function renderPaymentLogoRow(row) {
  return `<div class="footer-payment-grid__row">${row.map(renderPaymentLogo).join("")}</div>`;
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
          <a class="footer-support-strip__item" href="${businessInfo.facebookUrl}" target="_blank" rel="noopener noreferrer" aria-label="Visit Seasonedz Group on Facebook (opens in a new tab)">
            <span class="footer-support-strip__icon" aria-hidden="true">&#128077;</span>
            Facebook
          </a>
          <a class="footer-support-strip__item" href="${businessInfo.instagramUrl}" target="_blank" rel="noopener noreferrer" aria-label="Visit Seasonedz Group on Instagram (opens in a new tab)">
            <span class="footer-support-strip__icon" aria-hidden="true">&#128247;</span>
            Instagram
          </a>
          <a class="footer-support-strip__item" href="${businessInfo.tiktokUrl}" target="_blank" rel="noopener noreferrer" aria-label="Visit Seasonedz Group on TikTok (opens in a new tab)">
            <span class="footer-support-strip__icon" aria-hidden="true">&#127925;</span>
            TikTok
          </a>
          <a class="footer-support-strip__item" href="${businessInfo.xUrl}" target="_blank" rel="noopener noreferrer" aria-label="Visit Seasonedz Group on X (opens in a new tab)">
            <span class="footer-support-strip__icon" aria-hidden="true">&#10006;</span>
            X
          </a>
          <a class="footer-support-strip__item" href="${businessInfo.linkedinUrl}" target="_blank" rel="noopener noreferrer" aria-label="Visit Seasonedz Group on LinkedIn (opens in a new tab)">
            <span class="footer-support-strip__icon" aria-hidden="true">&#128188;</span>
            LinkedIn
          </a>
          <a class="footer-support-strip__item" href="${businessInfo.redditUrl}" target="_blank" rel="noopener noreferrer" aria-label="Visit Seasonedz Group on Reddit (opens in a new tab)">
            <span class="footer-support-strip__icon" aria-hidden="true">&#128125;</span>
            Reddit
          </a>
        </div>
      </div>

      <div class="container site-footer__inner">
        <div class="site-footer__col">
          <h4 class="footer-heading">General</h4>
          <ul class="footer-links">
            <li><a href="/about">About Us</a></li>
            <li><a href="/schools">Schools &amp; Churches</a></li>
            <li><a href="/blog">Blog</a></li>
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
            <li><a href="/returns-policy">Returns, Refunds and Exchanges</a></li>
            <li><a href="/terms">Terms and Conditions</a></li>
            <li><a href="/privacy-policy">Privacy Policy</a></li>
            <!-- Version 7, Milestone 171H: /cookies-policy already
                 existed as a real page (src/pages/cookiesPolicy.js) but
                 had no footer link pointing to it — added here rather
                 than creating a second "/cookie-policy" route, per the
                 milestone's own "don't duplicate an existing correct
                 implementation" principle. "Cookie Settings" is a real
                 <button>, not a dead link — it reopens the same
                 preferences manager the consent banner uses (see
                 js/app.js's openCookiePreferences()), so a customer can
                 change their choice at any time without needing an
                 account. -->
            <li><a href="/cookies-policy">Cookie Policy</a></li>
            <li><button type="button" class="footer-link-button" data-action="cookie-manage">Cookie Settings</button></li>
            <li><a href="/affiliate-terms">Affiliate Programme Terms</a></li>
            <li><a href="/track-order">Track Order</a></li>
          </ul>
        </div>

        <div class="site-footer__col">
          <h4 class="footer-heading">Account</h4>
          <ul class="footer-links">
            <li><a href="/account">My Account</a></li>
            <li><a href="/wishlist">Wishlist</a></li>
            <li><a href="/contact">Contact Us</a></li>
          </ul>
        </div>

        <div class="site-footer__col site-footer__col--payment">
          <h4 class="footer-heading">Payment Methods</h4>
          <div class="footer-payment-grid">
            ${PAYMENT_LOGO_ROWS.map(renderPaymentLogoRow).join("")}
          </div>
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
