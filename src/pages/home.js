// Homepage. Version 7, Milestone 150 full redesign: hero, "Hi,
// Friend" editorial intro, New Releases, a larger Best Seller
// feature, Shop by Collection, Digital Colouring Books, marketplace
// links, Google Reviews (hidden until a verified link exists), FAQ
// accordion and newsletter signup. General customer-journey and
// section-flow inspiration only from the Coco Wyo homepage — no code,
// CSS, layout measurements, copy, graphics, icons, card design,
// animation or brand identity copied; every asset, product and word
// below is Seasonedz Group's own.
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
import { getCardImageUrl, getDetailImageUrl } from "../js/imageTransforms.js";
import { withBase } from "../js/paths.js";
import { getCatalog } from "../js/api/productsApi.js";

// Exact order requested for the New Releases section.
const NEW_RELEASE_SLUGS = [
  "abc-colouring-book-for-kids-with-fun-facts",
  "little-hands-big-faith-new-testament-bible-colouring-book",
  "little-hands-big-faith-old-testament-bible-colouring-book",
];

const BEST_SELLER_SLUG = "abc-colouring-book-for-kids-with-fun-facts";

// Display heading intentionally differs slightly from the real
// category name in a couple of cases ("Kids' Learning" vs. the real
// "Kids Colouring Books", "Mindfulness for Adults" vs. "Mindfulness
// Colouring") — the brief's own requested wording — but each links to
// the real, matching, working category route/slug, confirmed against
// the live category list.
const COLLECTIONS = [
  {
    heading: "Kids’ Learning",
    categorySlug: "kids-colouring-books",
    blurb: "Alphabet tracing, fun facts and early learning activities.",
  },
  {
    heading: "Bible Colouring Books",
    categorySlug: "bible-colouring-books",
    blurb: "Faith-based colouring and Bible stories for children.",
  },
  {
    heading: "Mindfulness for Adults",
    categorySlug: "mindfulness-colouring",
    blurb: "Calming, therapeutic colouring pages for quiet moments.",
  },
  {
    heading: "Markers and Crayons",
    categorySlug: "markers-and-crayons",
    blurb: "Vibrant, safe creative supplies for every colouring book.",
  },
];

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

function renderCollectionSection(products) {
  const cards = COLLECTIONS.map((collection) => {
    const representative = products.find((product) => product.categorySlug === collection.categorySlug);
    if (!representative) return "";

    return `
      <a class="card collection-card" href="/shop?category=${collection.categorySlug}">
        <img
          class="card__image"
          src="${getCardImageUrl(representative.image)}"
          data-original-src="${representative.image}"
          alt="${representative.name}"
          width="400"
          height="400"
          loading="lazy"
          decoding="async"
        />
        <div class="card__body">
          <h3 class="card__title">${collection.heading}</h3>
          <p class="collection-card__desc">${collection.blurb}</p>
          <span class="collection-card__link">View Collection</span>
        </div>
      </a>
    `;
  }).join("");

  if (!cards) return "";

  return `
    <section class="section container">
      <div class="section__header">
        <h2>Find Your Creative Journey</h2>
        <p>Explore learning, faith, mindfulness and creative supplies for children and adults.</p>
      </div>
      <div class="category-grid">
        ${cards}
      </div>
    </section>
  `;
}

function renderDigitalSection() {
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
    ${renderCollectionSection(products)}
    ${renderDigitalSection()}
    ${renderMarketplaceHomeSection()}
    ${renderGoogleReviewsSection()}
    ${renderHomeFaqSection()}
    ${renderNewsletterSection()}
  `;
}
