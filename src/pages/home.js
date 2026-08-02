// Homepage. Version 7, Milestone 150 full redesign: hero, "Hi,
// Friend" editorial intro, New Releases, a larger Best Seller
// feature, Digital Colouring Books, marketplace links, Google Reviews
// (hidden until a verified link exists), FAQ accordion and newsletter
// signup. General customer-journey and section-flow inspiration only
// from the Coco Wyo homepage — no code, CSS, layout measurements,
// copy, graphics, icons, card design, animation or brand identity
// copied; every asset, product and word below is Seasonedz Group's
// own.
//
// Version 7, Milestone 158: the old "Find Your Creative Journey"
// category-collection section (category cards linking to /shop?
// category=...) was replaced with "Thoughtful Gifts Made With
// Purpose" — see renderGiftingSection() below and data/giftProducts.js.
// Shop category browsing itself is untouched; only this one homepage
// section changed.
//
// Product/category data loads from the backend API where possible,
// falling back to the static data files if it's unavailable — see
// js/api/productsApi.js.

import { renderProductCard } from "../components/productCard.js";
import { renderMarketplaceHomeSection } from "../components/marketplaceLinks.js";
import { renderGoogleReviewsSection } from "../components/googleReviews.js";
import { renderHomeFaqSection } from "../components/homeFaqAccordion.js";
import { renderNewsletterSection } from "../components/newsletterSignup.js";
import { isInWishlist } from "../js/wishlist.js";
import { getDetailImageUrl } from "../js/imageTransforms.js";
import { withBase } from "../js/paths.js";
import { getCatalog } from "../js/api/productsApi.js";
import { GIFT_PRODUCTS } from "../data/giftProducts.js";

// Exact order requested for the New Releases section.
const NEW_RELEASE_SLUGS = [
  "abc-colouring-book-for-kids-with-fun-facts",
  "little-hands-big-faith-new-testament-bible-colouring-book",
  "little-hands-big-faith-old-testament-bible-colouring-book",
];

const BEST_SELLER_SLUG = "abc-colouring-book-for-kids-with-fun-facts";

// Version 7, Milestone 158: how many gift cards show before "View
// More" — see renderGiftingSection() below.
const INITIAL_VISIBLE_COUNT = 3;

// Version 7, Milestone 150: none of these four digital editions exist
// as real product records yet (checked: no Prisma field, column, or
// data resembling a digital/downloadable product anywhere in the
// backend schema or product data). Rather than invent a price or a
// non-functional Add to Cart button, each shows "Coming Soon" and a
// "Notify Me" action that scrolls to the real newsletter form —
// clearly reported as missing records in this milestone's own report.
const DIGITAL_TITLES = [
  "ABC Colouring Book Digital Edition",
  "Mindfulness Colouring Book Digital Edition",
  "New Testament Bible Colouring Book Digital Edition",
  "Old Testament Bible Colouring Book Digital Edition",
];

function renderHiFriendSection() {
  return `
    <section class="section container">
      <div class="hi-friend">
        <h2 class="hi-friend__heading">Hi, friend!</h2>
        <div class="hi-friend__body">
          <p>We believe creativity can make learning, faith and quiet time feel more meaningful.</p>
          <p>Our books help children trace letters, discover new facts and explore Bible stories, while our mindfulness pages give adults a calm moment to slow down.</p>
          <p>Every Seasonedz book is created with care for families, classrooms, churches and anyone who enjoys learning through creativity.</p>
        </div>
      </div>
    </section>
  `;
}

function renderNewReleasesSection(products) {
  const byslug = new Map(products.map((product) => [product.slug, product]));
  const items = NEW_RELEASE_SLUGS.map((slug) => byslug.get(slug)).filter(Boolean);
  if (!items.length) return "";

  return `
    <section class="section container">
      <div class="section__header">
        <h2>New Releases</h2>
        <p>Fresh books created for learning, faith and meaningful creative time.</p>
      </div>
      <div class="product-grid new-releases-grid">
        ${items.map((product, index) => renderProductCard(product, { eager: index === 0, showViewLink: true })).join("")}
      </div>
    </section>
  `;
}

function renderBestSellerSection(products) {
  const product = products.find((item) => item.slug === BEST_SELLER_SLUG);
  if (!product) return "";

  const wishlisted = isInWishlist(product.id);

  return `
    <section class="section container">
      <div class="section__header">
        <h2>Our Best Seller</h2>
      </div>
      <div class="best-seller">
        <div class="best-seller__media">
          <img
            src="${getDetailImageUrl(product.image)}"
            data-original-src="${product.image}"
            alt="${product.name}"
            width="600"
            height="600"
            loading="lazy"
            decoding="async"
          />
        </div>
        <div class="best-seller__info">
          <h3 class="best-seller__title">${product.name}</h3>
          <p class="best-seller__text">
            Trace, colour and learn from A to Z. Created for preschool, Grade R and
            early primary learners, with uppercase and lowercase letter practice,
            fun facts and simple activities.
          </p>
          <p class="best-seller__price">R${product.price.toFixed(2)}</p>
          <div class="best-seller__actions">
            <a class="btn btn--primary" href="/product/${product.slug}">View the Book</a>
            <button
              type="button"
              class="btn btn--secondary"
              data-action="add-to-cart"
              data-product-id="${product.id}"
              data-slug="${product.slug}"
              data-name="${product.name}"
              data-price="${product.price}"
              data-image="${product.image}"
            >Add to Cart</button>
            <button
              type="button"
              class="best-seller__wishlist ${wishlisted ? "is-active" : ""}"
              data-action="toggle-wishlist"
              data-product-id="${product.id}"
              data-slug="${product.slug}"
              data-name="${product.name}"
              data-price="${product.price}"
              data-image="${product.image}"
              data-category="${product.category}"
              aria-pressed="${wishlisted}"
              aria-label="${wishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}"
            >${wishlisted ? "&#9829; Wishlisted" : "&#9825; Add to Wishlist"}</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

// Version 7, Milestone 158: one gift card. wrappedImage is presentation
// only — the card's own link always points at the real product route
// (never a fake gift-only route), and .card__image's existing
// site-wide `object-fit: contain` (components.css) already guarantees
// the wrapped photo, ribbon and gift tag are never cropped, same as
// every other product photo. No "Choose Gift Options" button: inspected
// productDetails.js and found no optional paid gift-wrapping selector
// exists there yet (see this milestone's own report) — showing one
// here would be a non-functional button, which the brief explicitly
// forbids.
function renderGiftCard(entry, product, { hiddenCard = false } = {}) {
  return `
    <article class="card product-card gift-card"${hiddenCard ? " hidden" : ""} data-gift-card${hiddenCard ? ' data-gift-card-extra="true"' : ""}>
      <div class="product-card__media">
        <a href="/product/${product.slug}">
          <img
            class="card__image"
            src="${withBase(entry.wrappedImage)}"
            alt="${entry.alt}"
            width="400"
            height="400"
            loading="lazy"
            decoding="async"
          />
        </a>
      </div>
      <div class="card__body product-card__body">
        <h3 class="card__title">
          <a href="/product/${product.slug}">${entry.title}</a>
        </h3>
        <p class="product-card__desc">${entry.description}</p>
        <p class="gift-card__notice">Optional gift wrapping available.</p>
        <div class="product-card__actions">
          <a class="btn btn--primary btn--sm" href="/product/${product.slug}">View Product</a>
        </div>
      </div>
    </article>
  `;
}

// Version 7, Milestone 158: replaces the old "Find Your Creative
// Journey" category-collection section. Each GIFT_PRODUCTS entry is
// only ever shown when its productSlug resolves to a real, ACTIVE
// product in the live catalogue — never a fake/duplicate product, and
// never a hard-coded route independent of the real product record.
// Reusable "View More" pattern: shows the first INITIAL_VISIBLE_COUNT
// cards, hides the rest (plain `hidden` attribute, no CSS needed), and
// only renders the toggle button at all once there are genuinely more
// than INITIAL_VISIBLE_COUNT real gift products to reveal — with
// exactly 3 configured today, this button doesn't render yet, but the
// logic already works for a 4th+ future addition with zero code
// changes (see data/giftProducts.js's own comment).
function renderGiftingSection(products) {
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const entries = GIFT_PRODUCTS.map((entry) => ({ entry, product: bySlug.get(entry.productSlug) })).filter(({ product }) => Boolean(product));

  if (entries.length === 0) return "";

  const hasMore = entries.length > INITIAL_VISIBLE_COUNT;

  const cards = entries
    .map(({ entry, product }, index) => renderGiftCard(entry, product, { hiddenCard: index >= INITIAL_VISIBLE_COUNT }))
    .join("");

  return `
    <section class="section container gifting-section">
      <div class="section__header">
        <h2 id="gifting-section-heading">Thoughtful Gifts Made With Purpose</h2>
        <p>Choose a meaningful colouring book for someone special. Optional gift wrapping can be added before completing your purchase.</p>
        <p class="gifting-section__disclosure">Gift wrapping is optional and charged separately.</p>
      </div>
      <div class="product-grid gifting-grid" id="gifting-grid">
        ${cards}
      </div>
      ${
        hasMore
          ? `
        <div class="gifting-section__view-more">
          <button
            type="button"
            class="btn btn--secondary"
            data-action="toggle-gift-view-more"
            aria-expanded="false"
            aria-controls="gifting-grid"
          >View More</button>
        </div>
      `
          : ""
      }
    </section>
  `;
}

// Version 7, Milestone 152: if real, active digital product records
// now exist (getCatalog() only ever returns ACTIVE/OUT_OF_STOCK
// products — see backend/product.service.ts's own VISIBLE_STATUSES),
// show them as real product cards, same as every other homepage
// section. Until the owner creates one, `digitalProducts` is always
// empty and this falls back to the exact same honest "Coming Soon" +
// "Notify Me" placeholders from Milestone 150 — never a fake price or
// a non-functional Add to Cart button for a title that doesn't exist.
function renderDigitalSection(digitalProducts = []) {
  if (digitalProducts.length > 0) {
    return `
      <section class="section container">
        <div class="section__header">
          <h2>Digital Colouring Books</h2>
          <p>Download, print and start creating at home, in class or at church.</p>
        </div>
        <div class="digital-grid new-releases-grid">
          ${digitalProducts.map((product) => renderProductCard(product)).join("")}
        </div>
      </section>
    `;
  }

  return `
    <section class="section container">
      <div class="section__header">
        <h2>Digital Colouring Books</h2>
        <p>Download, print and start creating at home, in class or at church.</p>
      </div>
      <div class="digital-grid">
        ${DIGITAL_TITLES.map(
          (title) => `
            <div class="card digital-card">
              <div class="digital-card__badge">Coming Soon</div>
              <div class="card__body">
                <h3 class="card__title">${title}</h3>
                <button type="button" class="btn btn--secondary btn--sm" data-action="scroll-to-newsletter">Notify Me</button>
              </div>
            </div>
          `
        ).join("")}
      </div>
    </section>
  `;
}

export async function renderHome() {
  const { products } = await getCatalog();

  return `
    <section class="container">
      <div class="hero">
        <!--
          Version 7, Milestone 149/150: owner-approved product photo
          banner. The empty space is on the LEFT third of the image,
          so .hero__content (DOM-first) is the box positioned there on
          desktop; .hero__image (DOM-second) is the visual banner.
          Putting content first in the DOM means the mobile layout
          (where .hero__content goes back to normal static flow, see
          responsive.css) stacks text above the image for free, with
          no flex order property needed.

          Both CTAs go to /shop: there's no dedicated "new releases"
          route or anchor anywhere in this app (checked router.js and
          shop.js) to send "Shop New Releases" to instead, and building
          one would mean changing router.js's shared click-handling
          behaviour — a bigger, more invasive change than this
          milestone's own scope.
        -->
        <div class="hero__content">
          <p class="hero__eyebrow">Learning, faith and calm through creativity</p>
          <h1 class="hero__title">Colouring Books Made With Purpose</h1>
          <p class="hero__subtitle">
            Explore educational colouring books for children, Bible activity
            books, mindfulness colouring for adults and creative supplies
            made for meaningful screen-free moments.
          </p>
          <div class="hero__actions">
            <a class="btn btn--primary" href="/shop">Shop New Releases</a>
            <a class="btn btn--secondary" href="/shop">Browse All Products</a>
          </div>
        </div>
        <!--
          This is the homepage's LCP candidate (large, first visual
          element) — eager loading + fetchpriority="high", and
          preloaded in index.html's own <head>, so nothing here ever
          lazy-loads or waits on JavaScript to appear. width/height are
          the source file's true dimensions (2078x757); .hero__image's
          own CSS keeps width:100% with height:auto (never
          object-fit:cover), so the full banner — including the
          product photography on the right — always renders at its
          real proportions, never stretched or cropped. Wrapped in
          <picture> (currently one source) so a future mobile-specific
          crop can be added as a <source media="(max-width: ...)">
          without any markup restructuring.
        -->
        <picture>
          <img
            class="hero__image"
            src="${withBase("/images/home/seasonedz-group-educational-colouring-books-hero.webp")}"
            alt="Seasonedz Group educational colouring books, Bible colouring books, mindfulness book, acrylic markers and rotating crayons."
            width="2078"
            height="757"
            loading="eager"
            fetchpriority="high"
          />
        </picture>
      </div>
    </section>

    ${renderHiFriendSection()}
    ${renderNewReleasesSection(products)}
    ${renderBestSellerSection(products)}
    ${renderGiftingSection(products)}
    ${renderDigitalSection(products.filter((product) => product.productType === "DIGITAL"))}
    ${renderMarketplaceHomeSection()}
    ${renderGoogleReviewsSection()}
    ${renderHomeFaqSection()}
    ${renderNewsletterSection()}
  `;
}
