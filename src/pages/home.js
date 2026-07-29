// Homepage. Hero, welcome message, categories, three curated product
// rails (featured / best sellers / new arrivals) built from real
// product data, a schools/wholesale banner and a customer trust section.
// No cart/checkout functionality lives here yet.
//
// Product/category data now loads from the backend API where
// possible, falling back to the static data files if it's unavailable
// — see js/api/productsApi.js.

import { renderCategoryCard } from "../components/categoryCard.js";
import { renderProductCard } from "../components/productCard.js";
import { renderMarketplaceHomeSection } from "../components/marketplaceLinks.js";
import { withBase } from "../js/paths.js";
import { getCatalog } from "../js/api/productsApi.js";

const MAX_PER_ROW = 4;

// Version 7, Milestone 93D: mobile-only "View All" link next to each
// homepage row's heading — hidden on desktop/tablet (see
// .section__view-all in components.css), the only visual addition at
// those widths. Goes to a real path href (never "#/shop") so
// router.js's handleLinkClick navigates it the same way as every
// other in-app link.
function renderProductRow(heading, subtext, list, viewAllHref) {
  if (!list.length) return "";

  return `
    <section class="section container">
      <div class="section__header">
        <div class="home-product-row__heading-line">
          <h2>${heading}</h2>
          <a class="section__view-all" href="${viewAllHref}">View All</a>
        </div>
        <p>${subtext}</p>
      </div>
      <div class="product-grid home-product-grid">
        ${list.slice(0, MAX_PER_ROW).map((product) => renderProductCard(product)).join("")}
      </div>
    </section>
  `;
}

export async function renderHome() {
  const { products, categories } = await getCatalog();

  const featured = products.filter((product) => product.isFeatured);
  const bestSellers = products.filter((product) => product.isBestSeller);
  const newArrivals = products.filter((product) => product.isNewArrival);

  return `
    <section class="container">
      <div class="hero">
        <!--
          Version 7, Milestone 149: owner-approved product photo
          banner. The empty space is on the LEFT third of the image,
          so .hero__content (DOM-first) is the box positioned there on
          desktop; .hero__image (DOM-second) is the visual banner.
          Putting content first in the DOM means the mobile layout
          (where .hero__content goes back to normal static flow, see
          responsive.css) stacks text above the image for free, with
          no flex order property needed.

          Both CTAs go to /shop: there's no dedicated bestsellers route
          or anchor anywhere in this app (checked router.js and
          shop.js) to send "Shop Bestsellers" to instead, and building
          one would mean changing router.js's shared click-handling
          behaviour — a bigger, more invasive change than this
          milestone's own scope.
        -->
        <div class="hero__content">
          <p class="hero__eyebrow">Learning, faith and calm through creativity</p>
          <h1 class="hero__title">Educational Colouring Books Made for Growing Minds</h1>
          <p class="hero__subtitle">
            Discover educational colouring books for children, Bible
            activity books, mindfulness colouring for adults and
            creative supplies from a trusted South African brand.
          </p>
          <div class="hero__actions">
            <a class="btn btn--primary" href="/shop">Shop Bestsellers</a>
            <a class="btn btn--secondary" href="/shop">Browse All Products</a>
          </div>
          <p class="hero__trust">South African brand &nbsp;|&nbsp; Nationwide delivery &nbsp;|&nbsp; Quality creative products</p>
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
            alt="Seasonedz Group educational colouring books, Bible colouring books, mindfulness colouring book, acrylic markers and rotating crayons."
            width="2078"
            height="757"
            loading="eager"
            fetchpriority="high"
          />
        </picture>
      </div>
    </section>

    ${renderMarketplaceHomeSection()}

    <section class="container welcome">
      <p>
        Welcome to Seasonedz Group &mdash; we create colouring books and
        creative learning products that help children learn, reflect and
        grow, one page at a time.
      </p>
    </section>

    <section class="section container">
      <div class="section__header">
        <h2>Shop by Category</h2>
        <p>Explore our range of colouring books and creative supplies.</p>
      </div>
      <div class="category-grid">
        ${categories.map((category, index) => renderCategoryCard(category, { eager: index < 3 })).join("")}
      </div>
    </section>

    ${renderProductRow("Featured Products", "A few customer favourites to get you started.", featured, "/shop")}
    ${renderProductRow("Best Sellers", "The colouring books and supplies our customers love most.", bestSellers, "/shop")}
    ${renderProductRow("New Arrivals", "Fresh additions to the Seasonedz Group range.", newArrivals, "/shop?sort=newest")}

    <section class="section container">
      <div class="wholesale-banner">
        <div class="wholesale-banner__text">
          <h2>Schools, Churches &amp; Bulk Orders</h2>
          <p>
            Buying for a preschool, school, church or as an educational gift
            in bulk? We offer bulk pricing and can help you find the right
            products.
          </p>
        </div>
        <div class="wholesale-banner__actions">
          <a class="btn btn--primary" href="/schools">Schools</a>
          <a class="btn btn--secondary" href="/wholesale">Wholesale &amp; Bulk</a>
        </div>
      </div>
    </section>

    <section class="section container">
      <div class="section__header">
        <h2>Why Families Choose Seasonedz Group</h2>
      </div>
      <div class="grid grid--4">
        <div class="trust-item">
          <div class="trust-item__icon" aria-hidden="true">&#10003;</div>
          <h4 class="trust-item__title">South African Small Business</h4>
          <p class="trust-item__text">Proudly serving families, schools and churches across South Africa.</p>
        </div>
        <div class="trust-item">
          <div class="trust-item__icon" aria-hidden="true">&#10003;</div>
          <h4 class="trust-item__title">For Every Age</h4>
          <p class="trust-item__text">From young learners to adults, our books support creativity, learning, faith and quiet time.</p>
        </div>
        <div class="trust-item">
          <div class="trust-item__icon" aria-hidden="true">&#10003;</div>
          <h4 class="trust-item__title">Real Support</h4>
          <p class="trust-item__text">Questions or a problem with your order? Our team is here to help. Get in touch any time.</p>
        </div>
        <div class="trust-item">
          <div class="trust-item__icon" aria-hidden="true">&#10003;</div>
          <h4 class="trust-item__title">Delivery Across South Africa</h4>
          <p class="trust-item__text">R80 delivery, free for registered customers on orders of R500 or more, via The Courier Guy where applicable. Handled with care by our small team.</p>
        </div>
      </div>
    </section>
  `;
}
