// Homepage. Hero, welcome message, categories, three curated product
// rails (featured / best sellers / new arrivals) built from real
// product data, a schools/wholesale banner and a customer trust section.
// No cart/checkout functionality lives here yet.

import { categories } from "../data/categories.js";
import { products } from "../data/products.js";
import { renderCategoryCard } from "../components/categoryCard.js";
import { renderProductCard } from "../components/productCard.js";

const MAX_PER_ROW = 4;

function renderProductRow(heading, subtext, list) {
  if (!list.length) return "";

  return `
    <section class="section container">
      <div class="section__header">
        <h2>${heading}</h2>
        <p>${subtext}</p>
      </div>
      <div class="grid grid--4">
        ${list.slice(0, MAX_PER_ROW).map((product) => renderProductCard(product)).join("")}
      </div>
    </section>
  `;
}

export function renderHome() {
  const featured = products.filter((product) => product.isFeatured);
  const bestSellers = products.filter((product) => product.isBestSeller);
  const newArrivals = products.filter((product) => product.isNewArrival);

  return `
    <section class="container">
      <div class="hero">
        <img class="hero__image" src="/images/hero-banner.jpg" alt="Seasonedz Group colouring books and school supplies" />
        <div class="hero__content">
          <h1 class="hero__title">Colour, Learn and Grow with Seasonedz</h1>
          <p class="hero__subtitle">
            Educational colouring books, Bible colouring books, mindfulness
            activities, markers and crayons for parents, teachers, schools
            and churches.
          </p>
          <a class="btn btn--primary" href="#/shop">Shop Now</a>
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
      <div class="grid grid--3">
        ${categories.map((category) => renderCategoryCard(category)).join("")}
      </div>
    </section>

    ${renderProductRow("Featured Products", "A few customer favourites to get you started.", featured)}
    ${renderProductRow("Best Sellers", "The colouring books and supplies our customers love most.", bestSellers)}
    ${renderProductRow("New Arrivals", "Fresh additions to the Seasonedz Group range.", newArrivals)}

    <section class="section container">
      <div class="wholesale-banner">
        <div class="wholesale-banner__text">
          <h2>Schools &amp; Wholesale Orders</h2>
          <p>Bulk pricing for schools, churches and organisations is coming soon.</p>
        </div>
        <a class="btn btn--primary" href="#/contact">Enquire Now</a>
      </div>
    </section>

    <section class="section container">
      <div class="grid grid--3">
        <div class="trust-item">
          <div class="trust-item__icon">&#10003;</div>
          <h4 class="trust-item__title">Quality Assured</h4>
          <p class="trust-item__text">Carefully designed, safe and durable products.</p>
        </div>
        <div class="trust-item">
          <div class="trust-item__icon">&#128666;</div>
          <h4 class="trust-item__title">Nationwide Delivery</h4>
          <p class="trust-item__text">Courier delivery is coming soon.</p>
        </div>
        <div class="trust-item">
          <div class="trust-item__icon">&#9825;</div>
          <h4 class="trust-item__title">Loved by Parents &amp; Teachers</h4>
          <p class="trust-item__text">Trusted by families, schools and churches.</p>
        </div>
      </div>
    </section>
  `;
}
