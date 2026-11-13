// Christmas colouring gift guide. Copy is owner-supplied; every price,
// saving and the free-delivery threshold are read live so this page
// can never quote a stale figure.

import { renderProductCard } from "../components/productCard.js";
import { getCatalog } from "../js/api/productsApi.js";
import { getDeliveryFeesSafely } from "./shippingPolicy.js";
import { escapeHtml } from "../js/search.js";

const NOTES = {
  "rotating-wax-crayons-12-colours": "Twist-up crayons for small hands. A good stocking filler, and a useful add-on for any of the books below.",
  "abc-colouring-book-for-kids-with-fun-facts": "An A4 alphabet book with tracing and fun facts. For children who are starting to learn their letters.",
  "little-hands-big-faith-new-testament-bible-colouring-book": "Bible stories from the New Testament to colour, for ages 6 to 10.",
  "little-hands-big-faith-old-testament-bible-colouring-book": "Old Testament stories to colour, for ages 6 to 10.",
  "acrylic-marker-set-24-colours": "Non-bleed acrylic paint markers. The price depends on the set you choose.",
  "mindfulness-colouring-book-for-adults": "Calming designs for adults. A quiet gift for a parent, a teacher or a friend who needs a rest.",
  "abc-book-and-markers-bundle": "The alphabet book with a set of crayons, so the gift is ready to use on Christmas morning.",
  "new-testament-bible-colouring-book-and-24-acrylic-markers-bundle-for-kids-ages-6-to-10": "For ages 6 to 10.",
  "school-starter-colouring-pack": "For ages 6 to 10.",
  "bible-colouring-book-bundle": "Both Bible colouring books together.",
  "mindfulness-book-and-markers-bundle": "The adult colouring book with markers.",
};

// Bundles whose saving can be worked out from single products sold on
// their own. The saving line is only shown when it is really positive.
const BUNDLE_PARTS = {
  "abc-book-and-markers-bundle": ["abc-colouring-book-for-kids-with-fun-facts", "rotating-wax-crayons-12-colours"],
  "bible-colouring-book-bundle": ["little-hands-big-faith-new-testament-bible-colouring-book", "little-hands-big-faith-old-testament-bible-colouring-book"],
};

const BANDS = [
  { heading: "Under R100", test: (price) => price < 100 },
  { heading: "R100 to R159", test: (price) => price >= 100 && price < 160 },
  { heading: "R160 and over: bundles", test: (price) => price >= 160 },
];

const SUITS = [
  { for: "A child learning letters", slugs: ["abc-colouring-book-for-kids-with-fun-facts", "abc-book-and-markers-bundle"], gift: "ABC Colouring Book, or the ABC and crayons bundle" },
  { for: "A child aged 6 to 10 in a Christian home", slugs: ["little-hands-big-faith-new-testament-bible-colouring-book", "bible-colouring-book-bundle"], gift: "Either Bible colouring book, or both in the bundle" },
  { for: "Someone who already colours or draws", slugs: ["acrylic-marker-set-24-colours"], gift: "Acrylic paint marker set" },
  { for: "A parent, teacher or grandparent", slugs: ["mindfulness-colouring-book-for-adults", "mindfulness-book-and-markers-bundle"], gift: "Mindfulness colouring book, with or without markers" },
  { for: "A stocking filler", slugs: ["rotating-wax-crayons-12-colours"], gift: "Rotating wax crayons" },
];

function giftPrice(product) {
  return product.hasVariants && product.variantPriceRange ? product.variantPriceRange.min : product.price;
}

function formatPrice(product) {
  return `${product.hasVariants && product.variantPriceRange ? "From " : ""}R${giftPrice(product).toFixed(2)}`;
}

function savingNote(product, bySlug) {
  const parts = BUNDLE_PARTS[product.slug]?.map((slug) => bySlug.get(slug));
  if (!parts || parts.some((part) => !part || part.hasVariants)) return "";
  const saving = parts.reduce((sum, part) => sum + part.price, 0) - product.price;
  return saving > 0 ? ` R${saving.toFixed(2)} less than buying them separately.` : "";
}

function renderItem(product, bySlug, index) {
  const note = NOTES[product.slug] || "";
  const saving = savingNote(product, bySlug);
  return `
    <div class="gift-guide__item">
      ${renderProductCard(product, { eager: index < 4 })}
      ${note || saving ? `<p class="gift-guide__note">${escapeHtml(note)}${escapeHtml(saving)}</p>` : ""}
    </div>
  `;
}

function renderSuitsRow(row, bySlug) {
  const products = row.slugs.map((slug) => bySlug.get(slug));
  if (products.some((product) => !product)) return "";
  const links = products.map((product) => `<a href="/product/${encodeURIComponent(product.slug)}">${escapeHtml(formatPrice(product))}</a>`).join(" or ");
  return `<tr><td>${escapeHtml(row.for)}</td><td>${escapeHtml(row.gift)}</td><td>${links}</td></tr>`;
}

export async function renderChristmasGiftGuide() {
  const [{ products }, { threshold }] = await Promise.all([getCatalog(), getDeliveryFeesSafely()]);
  const giftable = products
    .filter((product) => (product.productType || "PHYSICAL") !== "DIGITAL")
    .sort((a, b) => giftPrice(a) - giftPrice(b));
  const bySlug = new Map(giftable.map((product) => [product.slug, product]));

  let cardIndex = 0;
  const bands = BANDS.map((band) => {
    const inBand = giftable.filter((product) => band.test(giftPrice(product)));
    if (!inBand.length) return "";
    return `
      <h2>${band.heading}</h2>
      <div class="product-grid gift-guide__grid">
        ${inBand.map((product) => renderItem(product, bySlug, cardIndex++)).join("")}
      </div>
    `;
  }).join("");

  return `
    <section class="stub-page container gift-guide">
      <h1 class="stub-page__title">Christmas colouring gifts, sorted by price</h1>
      <p class="stub-page__text">
        A colouring book is an easy gift to get right. It gets used, it keeps
        children busy over the long December holiday, and it doesn't need
        batteries or a screen. This guide lists everything in our range by
        price, so you can find something for a stocking, a Sunday school
        class or a grandparent in a few minutes.
      </p>
      <p class="stub-page__text">All prices are in rand and are the current prices in our shop.</p>

      ${bands}

      <div class="info-page__body gift-guide__body">
        <h2>Who each gift suits</h2>
        <div class="gift-guide__table-wrap">
          <table class="gift-guide__table">
            <thead><tr><th scope="col">For</th><th scope="col">Gift</th><th scope="col">Price</th></tr></thead>
            <tbody>
              ${SUITS.map((row) => renderSuitsRow(row, bySlug)).join("")}
              <tr><td>A Sunday school class</td><td>Bible colouring books. Ask us about bulk orders</td><td><a href="/schools">See our schools and churches page</a></td></tr>
            </tbody>
          </table>
        </div>

        <h2>Delivery and collection</h2>
        <p>
          We deliver anywhere in South Africa with The Courier Guy. Delivery
          is free once your products total R${threshold.toFixed(2)} or more. You can also collect
          your order in Pretoria or Thohoyandou at no charge.
        </p>
        <p>
          Buying for a school, church or Sunday school? See our
          <a href="/schools">schools and churches page</a> for bulk orders.
        </p>

        <p class="gift-guide__actions">
          <a class="btn btn--primary" href="/shop">Shop all gifts</a>
          <a class="btn btn--secondary" href="/schools">Bulk orders for schools and churches</a>
        </p>
      </div>
    </section>
  `;
}
