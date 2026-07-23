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
          Version 7, Milestone 92A: this is the homepage's LCP
          candidate (large, full-width, first visual element) — eager
          loading + fetchpriority="high" (used nowhere else on this
          image type) to prioritise its download; width/height are the
          source file's true dimensions (1400x560). .hero__image's own
          CSS already fully fixes both width (100%) and height (420px)
          regardless of the image's ratio, so these attributes don't
          change layout — they're set for correctness, and the
          fetchpriority/eager loading are the parts that actually help.
        -->
        <img
          class="hero__image"
          src="${withBase("/images/hero-banner.jpg")}"
          alt="Seasonedz Group colouring books and school supplies"
          width="1400"
          height="560"
          loading="eager"
          fetchpriority="high"
        />
        <div class="hero__content">
          <h1 class="hero__title">Colour, Learn and Grow with Seasonedz</h1>
          <p class="hero__subtitle">
            Educational colouring books, Bible colouring books, mindfulness
            activities, markers and crayons for parents, teachers, schools
            and churches.
          </p>
          <a class="btn btn--primary" href="/shop">Shop Now</a>
        </div>
      </div>
    </section>

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
          <p class="trust-item__text">R80 delivery, free from R700, via The Courier Guy where applicable. Handled with care by our small team.</p>
        </div>
      </div>
    </section>
  `;
}
