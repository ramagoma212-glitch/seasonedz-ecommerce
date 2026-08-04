// Single product details page. Loads a product by the :slug route param
// supplied by router.js. Add to Cart, Add to Wishlist and the quantity
// selector are visual only — see js/app.js for the delegated handlers.
//
// Product data now loads from the backend API where possible, falling
// back to the static data file if it's unavailable — see
// js/api/productsApi.js.
//
// Version 6, Milestone 48: once the product is known, this overrides
// the router's generic "Product | Seasonedz Group" title/description
// with the real product name and its own short description, and adds
// Product structured data (JSON-LD) — see js/seo.js. Deliberately
// never includes aggregateRating/review fields in that structured
// data: rating/reviewCount are sample data, not real reviews, and
// claiming them as real review markup to search engines would be
// misleading — see VERSION_6_PRODUCT_PAGES_AND_SEO_PLAN.md. Version 7,
// Milestone 95: removed the visible rating/reviewCount display on this
// page too, for the same reason.

import { renderProductCard } from "../components/productCard.js";
import { renderContactSupportNote } from "../components/contactSupportNote.js";
import { renderProductMarketplaceBlock } from "../components/marketplaceLinks.js";
import { renderProductDeliveryAccordion } from "../components/productDeliveryAccordion.js";
import { isInWishlist } from "../js/wishlist.js";
import { getCatalog } from "../js/api/productsApi.js";
import { setPageMeta, setPageStructuredData } from "../js/seo.js";
import { getDetailImageUrl, getGalleryThumbUrl, getLightboxImageUrl } from "../js/imageTransforms.js";
import { escapeHtml } from "../js/search.js";
import { resolveDescriptionHtml } from "../js/descriptionFormat.js";
import { GIFT_WRAP_FEE_PER_ITEM, GIFT_MESSAGE_MAX_LENGTH } from "../js/cart.js";
import { withBase } from "../js/paths.js";

function renderNotFound() {
  setPageMeta({ title: "Product Not Found", noindex: true });
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Product Not Found</h1>
      <p class="stub-page__text">
        We couldn't find the product you were looking for. It may have
        been removed or the link may be incorrect.
      </p>
      <a class="btn btn--primary" href="/shop">Back to Shop</a>
    </section>
  `;
}

// One of "In Stock" / "Low Stock" / "Out of Stock" today (see
// data/products.js) — mapped to schema.org's own availability values
// rather than passed through as-is, since those are the only three
// values this catalogue's stockStatus ever actually takes.
function schemaAvailability(stockStatus) {
  if (stockStatus === "Out of Stock") return "https://schema.org/OutOfStock";
  return "https://schema.org/InStock";
}

function buildProductStructuredData(product) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription,
    image: new URL(product.image, window.location.origin).href,
    category: product.category,
    offers: {
      "@type": "Offer",
      priceCurrency: "ZAR",
      price: product.price.toFixed(2),
      availability: schemaAvailability(product.stockStatus),
      url: window.location.href,
    },
  };
}

// Version 6, Milestone 52: short, honest "buying confidence" copy for
// the product page — built only from real product data (ageRange,
// categorySlug) already shown elsewhere on the page, never invented
// reviews, ratings or testimonials. categoryUseCase is generic
// per-category context, not a per-product claim.
const categoryUseCase = {
  "kids-colouring-books": "home, pre-school and the classroom",
  "bible-colouring-books": "Sunday school and family devotion time",
  "mindfulness-colouring": "quiet, screen-free relaxation time",
  "markers-and-crayons": "everyday colouring at home or school",
  bundles: "gifting, or getting started with everything in one set",
  "schools-and-wholesale": "classrooms, schools and bulk orders",
};

function renderGoodFor(product) {
  const useCase = categoryUseCase[product.categorySlug] || "everyday creative time";
  return `
    <h3>Good For</h3>
    <p>This product suits ${product.ageRange}, and works well for ${useCase}.</p>
  `;
}

// Version 7, Milestone 159: optional paid gift wrapping — only ever
// rendered for a PHYSICAL product (see the caller below); digital
// products never get this section at all, so there is no client-side
// way to even attempt requesting gift wrap for one. The fee shown here
// is display-only (imported from cart.js, itself mirroring the
// backend's authoritative config/giftWrap.ts) — the backend
// independently recomputes and validates R30/item itself and ignores
// anything this page or the request body claims. Unchecked by default;
// the message field only appears once wrapping is selected, and is
// never required to check the box.
function renderGiftWrapOption() {
  return `
    <div class="product-details__gift-wrap" data-gift-wrap-section>
      <label class="gift-wrap-option">
        <input
          type="checkbox"
          id="giftWrapCheckbox"
          data-action="toggle-gift-wrap"
          aria-controls="giftMessageField"
          aria-expanded="false"
        />
        <span>Make it a gift &mdash; add gift wrapping for R${GIFT_WRAP_FEE_PER_ITEM}</span>
      </label>
      <div class="gift-wrap-message" id="giftMessageField" data-gift-message-field hidden>
        <label class="form-field__label" for="giftMessageInput">Gift message <span class="form-field__optional">(optional)</span></label>
        <textarea
          id="giftMessageInput"
          class="form-field__input form-field__textarea"
          maxlength="${GIFT_MESSAGE_MAX_LENGTH}"
          rows="3"
          placeholder="e.g. Happy Birthday, Naledi!"
        ></textarea>
        <p class="gift-wrap-message__hint">Up to ${GIFT_MESSAGE_MAX_LENGTH} characters</p>
      </div>
    </div>
  `;
}

// Version 7, Milestone 168C: replaces the old single-paragraph
// delivery note with the fuller Delivery Options / Free Delivery /
// Free Collection / Returns & Exchanges accordion group — see
// components/productDeliveryAccordion.js. Physical products only; a
// DIGITAL product has nothing to deliver (renderDigitalDownloadNote()
// below covers it instead).

// Version 7, Milestone 168C: owner-supplied, owner-approved artwork
// (public/images/payment-methods-payfast.png, byte-identical to the
// supplied "Payment logos.png" — see this milestone's asset-handling
// notes). Informational only — PayFast itself still presents and
// processes whichever of these nine methods the customer actually
// picks; nothing here is a separate payment integration or checkout
// choice. width/height match the source file's true 1536x1024 pixel
// size (prevents layout shift while it loads); CSS scales it down
// responsively (see pages.css).
function renderPaymentMethodsBlock() {
  return `
    <div class="product-details__payment-methods">
      <h3>Secure payment options</h3>
      <p>Pay securely through PayFast using your preferred payment method.</p>
      <img
        class="product-details__payment-logos"
        src="${withBase("/images/payment-methods-payfast.png")}"
        alt="Secure payment methods available through PayFast including Visa, Mastercard, Apple Pay, Google Pay, Samsung Pay, Instant EFT, SnapScan, Zapper and Payflex."
        width="1536"
        height="1024"
        loading="lazy"
        decoding="async"
      />
    </div>
  `;
}

// Version 7, Milestone 152: replaces the physical delivery note for a
// DIGITAL product. Only ever shows file format/printable pages if
// they're actually stored on the product's digital asset (see
// product.service.ts's own toProductOutput()) — never a guessed or
// invented value.
function renderDigitalDownloadNote(product) {
  const digital = product.digitalDownload;
  return `
    <h3>Digital Download</h3>
    <p>
      No physical book will be delivered for this product. Your download
      will be available after successful payment${digital?.fileType ? ` (${digital.fileType} file` : ""}${digital?.pageCount ? `, ${digital.pageCount} printable pages)` : digital?.fileType ? ")" : ""}.
      Logged-in customers can download from My Account &rarr; Orders; guest
      customers receive a secure download link by email once payment is
      confirmed.
    </p>
    ${digital?.termsNote ? `<p>${escapeHtml(digital.termsNote)}</p>` : ""}
  `;
}

function renderSupportNote() {
  return `
    <h3>Support</h3>
    ${renderContactSupportNote("Questions about this product before you order?")}
  `;
}

// Version 7, Milestone 144C: the gallery's full image list (detail,
// lightbox and thumbnail URLs already resolved) travels with the page
// as one JSON blob on the gallery root's [data-images] attribute — the
// single source of truth app.js's slider/lightbox navigation reads
// from and updates (data-current-index) as the customer moves between
// images. escapeHtml() (not JSON's own escaping) is what makes this
// safe to embed inside an HTML attribute — see js/search.js.
function renderGallery(product) {
  const images = product.gallery?.length ? product.gallery : [product.image];
  const hasMultiple = images.length > 1;

  const galleryData = images.map((img, index) => ({
    src: getDetailImageUrl(img),
    lightboxSrc: getLightboxImageUrl(img),
    alt: images.length > 1 ? `${product.name} (image ${index + 1} of ${images.length})` : product.name,
    original: img,
  }));

  return `
    <div class="product-details__gallery" data-gallery data-current-index="0" data-images="${escapeHtml(JSON.stringify(galleryData))}">
      <div class="product-details__main-wrap">
        ${
          hasMultiple
            ? `<button type="button" class="product-details__nav product-details__nav--prev" data-action="gallery-prev" aria-label="Previous product image">&lsaquo;</button>`
            : ""
        }
        <!--
          Version 7, Milestone 92A: this is the page's primary content
          image (immediately visible, no scrolling needed) — eager, not
          lazy. width/height=800 match .product-details__main-image's
          own CSS (aspect-ratio: 1/1, width: 100%) as a same-ratio
          reference size, not the actual served resolution.
        -->
        <button
          type="button"
          class="product-details__main-image-btn"
          data-action="view-larger-image"
          aria-label="View larger image of ${product.name}"
        >
          <img
            class="product-details__main-image"
            src="${galleryData[0].src}"
            data-original-src="${images[0]}"
            alt="${galleryData[0].alt}"
            width="800"
            height="800"
            loading="eager"
            decoding="async"
          />
        </button>
        ${
          hasMultiple
            ? `<button type="button" class="product-details__nav product-details__nav--next" data-action="gallery-next" aria-label="Next product image">&rsaquo;</button>`
            : ""
        }
      </div>
      ${
        hasMultiple
          ? `
            <div class="product-details__thumbs">
              ${images
                .map(
                  (img, index) =>
                    `<button
                      type="button"
                      class="product-details__thumb-btn${index === 0 ? " is-active" : ""}"
                      data-action="gallery-select"
                      data-index="${index}"
                      aria-label="View image ${index + 1} of ${product.name}"
                      aria-current="${index === 0}"
                    >
                      <img class="product-details__thumb" src="${getGalleryThumbUrl(img)}" alt="${product.name} thumbnail ${index + 1}" width="64" height="64" loading="lazy" decoding="async" />
                    </button>`
                )
                .join("")}
            </div>
          `
          : ""
      }
    </div>
  `;
}

function renderRelatedProducts(product, products) {
  const related = products
    .filter((item) => item.categorySlug === product.categorySlug && item.id !== product.id)
    .slice(0, 4);

  if (!related.length) return "";

  return `
    <section class="section">
      <div class="section__header">
        <h2>You May Also Like</h2>
        <p>More from ${product.category}.</p>
      </div>
      <div class="product-grid">
        ${related.map((item) => renderProductCard(item)).join("")}
      </div>
    </section>
  `;
}

export async function renderProductDetails({ slug } = {}) {
  const { products } = await getCatalog();
  const product = products.find((item) => item.slug === slug);
  if (!product) return renderNotFound();

  setPageMeta({ title: product.name, description: product.shortDescription });
  setPageStructuredData(buildProductStructuredData(product));

  const wishlisted = isInWishlist(product.id);

  return `
    <section class="container product-details">
      <a class="product-details__back" href="/shop">&larr; Back to Shop</a>

      <div class="product-details__layout">
        ${renderGallery(product)}

        <div class="product-details__info">
          <p class="product-details__category">${product.category}</p>
          <h1 class="product-details__title">${product.name}</h1>
          ${product.productType === "DIGITAL" ? `<span class="badge product-details__digital-badge">Digital Download</span>` : ""}

          <div class="product-details__price-row">
            <span class="product-details__price">R${product.price.toFixed(2)}</span>
            ${product.oldPrice ? `<span class="product-details__old-price">R${product.oldPrice.toFixed(2)}</span>` : ""}
            ${product.discountLabel ? `<span class="badge">${product.discountLabel}</span>` : ""}
          </div>

          <p class="product-details__stock">${product.stockStatus}</p>
          <p class="product-details__short-desc">${product.shortDescription}</p>

          <!--
            Purchase area (Version 7, Milestone 168C): 1. Quantity + Add
            to Cart, 2. Add to Wishlist, 3. Gift Wrapping (when
            eligible), 4. Secure payment options, 5. Delivery/Returns
            information, in that order.
          -->
          <div class="product-details__purchase-row">
            <div class="product-details__quantity">
              <span>Quantity</span>
              <div class="quantity-selector">
                <button type="button" class="quantity-selector__btn" data-action="qty-decrease" aria-label="Decrease quantity">&minus;</button>
                <input type="number" class="quantity-selector__input" value="1" min="1" readonly />
                <button type="button" class="quantity-selector__btn" data-action="qty-increase" aria-label="Increase quantity">&plus;</button>
              </div>
            </div>
            <button
              type="button"
              class="btn btn--primary product-details__add-to-cart"
              data-action="add-to-cart"
              data-product-id="${product.id}"
              data-slug="${product.slug}"
              data-name="${product.name}"
              data-price="${product.price}"
              data-image="${product.image}"
              data-product-type="${product.productType || "PHYSICAL"}"
            >
              Add to Cart
            </button>
          </div>

          <button
            type="button"
            class="btn btn--secondary btn--block product-details__wishlist-btn ${wishlisted ? "is-active" : ""}"
            data-action="toggle-wishlist"
            data-product-id="${product.id}"
            data-slug="${product.slug}"
            data-name="${product.name}"
            data-price="${product.price}"
            data-image="${product.image}"
            data-category="${product.category}"
            aria-pressed="${wishlisted}"
          >
            <span aria-hidden="true">${wishlisted ? "&#9829;" : "&#9825;"}</span> ${wishlisted ? "Remove from Wishlist" : "Add to Wishlist"}
          </button>

          ${product.productType !== "DIGITAL" ? renderGiftWrapOption() : ""}

          ${renderPaymentMethodsBlock()}

          ${product.productType !== "DIGITAL" ? renderProductDeliveryAccordion() : ""}

          ${renderProductMarketplaceBlock()}

          <div class="product-details__meta">
            ${product.paperSize ? `<p><strong>Size:</strong> ${product.paperSize}</p>` : ""}
            ${product.pageCount ? `<p><strong>Pages:</strong> ${product.pageCount}</p>` : ""}
            ${product.binding ? `<p><strong>Binding:</strong> ${product.binding}</p>` : ""}
            <p><strong>Age Range:</strong> ${product.ageRange}</p>
            <p><strong>Tags:</strong> ${product.tags.join(", ")}</p>
          </div>
        </div>
      </div>

      <div class="product-details__description">
        <h2>Product Description</h2>
        <div class="product-details__description-content">${resolveDescriptionHtml(product.description)}</div>

        <h3>Features</h3>
        <ul class="product-details__features">
          ${product.features.map((feature) => `<li>${feature}</li>`).join("")}
        </ul>

        ${renderGoodFor(product)}
        ${product.productType === "DIGITAL" ? renderDigitalDownloadNote(product) : ""}
        ${renderSupportNote()}
      </div>

      ${renderRelatedProducts(product, products)}
    </section>
  `;
}
