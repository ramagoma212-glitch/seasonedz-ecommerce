// Site footer component: logo, company description, three link groups
// (Help / Seasonedz Group / Legal), real contact details and
// copyright.
//
// Version 7, Milestone 150: reorganised into the brief's four named
// groups (Shop / Help / Seasonedz Group / Legal). No verified social
// media links (Facebook/Instagram/etc.) exist anywhere in this
// project to add here.
//
// Version 7, Milestone 168F: the footer's own "Shop" group (Physical
// Books/Digital Downloads/Creative Supplies/Best Sellers/New Releases)
// was removed — Shop is already reachable from the header nav (both
// desktop and mobile) and every one of these links pointed at /shop
// anyway (a few with no dedicated route/filter yet even before this
// change), so the group was pure duplication rather than distinct
// navigation. /shop itself, the header's Shop link, and every route
// these links used are untouched.
//
// Version 7, Milestone 167: the "Shop Seasonedz Group on" marketplace
// line that used to sit directly above the copyright text was removed
// — marketplace links now live only in the homepage's own "Also
// Available On" section (components/marketplaceLinks.js's
// renderMarketplaceHomeSection()), per the owner's explicit "keep
// marketplace links only in one place" decision. Nothing else in the
// footer changed.
//
// Version 7, Milestone 168E: a compact "Secure Payments" trust section
// sits above the copyright line — same owner-approved WebP artwork
// used on the product page and checkout (informational only; PayFast
// remains the only real payment integration).

import { withBase } from "../js/paths.js";
import { businessInfo } from "../data/businessInfo.js";

export function renderFooter() {
  const year = new Date().getFullYear();

  return `
    <footer class="site-footer">
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
          <h4 class="footer-heading">Help</h4>
          <ul class="footer-links">
            <li><a href="/account">My Account</a></li>
            <li><a href="/contact">Contact</a></li>
            <li><a href="/shipping-policy">Delivery Policy</a></li>
            <li><a href="/returns-policy">Returns Policy</a></li>
            <li><a href="/faq">FAQs</a></li>
            <li><a href="/track-order">Order Tracking</a></li>
          </ul>
        </div>

        <div class="site-footer__col">
          <h4 class="footer-heading">Seasonedz Group</h4>
          <ul class="footer-links">
            <li><a href="/about">About</a></li>
            <li><a href="/schools">Schools and Churches</a></li>
            <li><a href="/wholesale">Wholesale</a></li>
            <li><a href="/testimonials">Testimonials</a></li>
          </ul>
        </div>

        <div class="site-footer__col">
          <h4 class="footer-heading">Legal</h4>
          <ul class="footer-links">
            <li><a href="/privacy-policy">Privacy Policy</a></li>
            <li><a href="/terms">Terms &amp; Conditions</a></li>
            <li><a href="/cookies-policy">Cookie Policy</a></li>
          </ul>
        </div>

        <div class="site-footer__col">
          <h4 class="footer-heading">Contact Us</h4>
          <ul class="footer-links">
            <li>Email: <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a></li>
            <li>WhatsApp: <a href="${businessInfo.whatsappUrl}" target="_blank" rel="noopener noreferrer">${businessInfo.phoneDisplay}</a></li>
            <li>Phone: <a href="${businessInfo.telUrl}">${businessInfo.phoneDisplay}</a></li>
            <li>South Africa</li>
            ${
              businessInfo.googleReviewRequestUrl
                ? `<li><a href="${businessInfo.googleReviewRequestUrl}" target="_blank" rel="noopener noreferrer" aria-label="Leave a Google review for Seasonedz Group (opens in a new tab)">Review us on Google</a></li>`
                : ""
            }
          </ul>
        </div>
      </div>

      <div class="footer-payment-trust">
        <p class="footer-payment-trust__heading">Secure Payments</p>
        <p class="footer-payment-trust__desc">Safe and convenient payment options powered by PayFast.</p>
        <img
          class="footer-payment-trust__logos"
          src="${withBase("/images/payment-methods-payfast.webp")}"
          alt="Secure payment methods available through PayFast including Visa, Mastercard, Apple Pay, Google Pay, Samsung Pay, Instant EFT, SnapScan, Zapper and Payflex."
          width="720"
          height="480"
          loading="lazy"
          decoding="async"
        />
      </div>

      <div class="site-footer__bottom">
        &copy; ${year} Seasonedz Group. All rights reserved.
      </div>
    </footer>
  `;
}
