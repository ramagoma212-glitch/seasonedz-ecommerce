// Site footer component: logo, company description, four link groups
// (Shop / Help / Seasonedz Group / Legal), real contact details,
// marketplace links and copyright.
//
// Version 7, Milestone 150: reorganised into the brief's four named
// groups. A few Shop links have no dedicated route/filter yet — noted
// individually below and in this milestone's own report — and safely
// fall back to the general /shop page rather than a broken link. No
// verified social media links (Facebook/Instagram/etc.) exist
// anywhere in this project to add here.

import { withBase } from "../js/paths.js";
import { businessInfo } from "../data/businessInfo.js";
import { renderFooterMarketplaceLinks } from "./marketplaceLinks.js";

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
          <h4 class="footer-heading">Shop</h4>
          <ul class="footer-links">
            <li><a href="/shop">Physical Books</a></li>
            <li><a href="/shop">Digital Downloads</a></li>
            <li><a href="/shop?category=markers-and-crayons">Creative Supplies</a></li>
            <li><a href="/shop">Best Sellers</a></li>
            <li><a href="/shop?sort=newest">New Releases</a></li>
          </ul>
        </div>

        <div class="site-footer__col">
          <h4 class="footer-heading">Help</h4>
          <ul class="footer-links">
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

      <div class="site-footer__bottom">
        ${renderFooterMarketplaceLinks()}
        &copy; ${year} Seasonedz Group. All rights reserved.
      </div>
    </footer>
  `;
}
