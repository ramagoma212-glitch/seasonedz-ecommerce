// Milestone 197: the single place that decides which images a product
// detail page's gallery shows, and builds the gallery markup for them.
// Shared between pages/productDetails.js (initial page render) and
// js/app.js (live variant-switch update via handleSelectVariantOption),
// so the two can never drift apart — the exact same "replace, never
// merge" fallback rule and the exact same markup/data-images shape are
// used whether the gallery is being rendered for the first time or
// rebuilt in place after the customer picks a different variant.

import { getDetailImageUrl, getGalleryThumbUrl, getLightboxImageUrl } from "./imageTransforms.js";
import { escapeHtml } from "./search.js";

// Milestone 188/197 fallback rule, restated exactly as the brief
// requires: a selected variant with its own dedicated images shows
// ONLY those images; a selected variant with none (or no variant
// selected at all) shows ONLY the product's own shared gallery. The
// two are never merged — switching to a variant with no images of its
// own must fully restore the product-level gallery, not leave a
// variant image stuck in the mix.
export function resolveGalleryImages(baseImages, variantImages) {
  if (Array.isArray(variantImages) && variantImages.length > 0) {
    return variantImages;
  }
  return Array.isArray(baseImages) ? baseImages : [];
}

// Returns both the inner HTML (main image + thumbnail strip) and the
// galleryData array the data-images attribute needs — callers decide
// how to attach each (productDetails.js embeds galleryData inside the
// initial HTML string via escapeHtml(JSON.stringify(...)); app.js sets
// it directly as a DOM property, which needs no manual escaping at
// all since it's never parsed back out of an HTML string).
export function buildGalleryInner(images, productName) {
  const safeImages = images.length > 0 ? images : [""];
  const hasMultiple = safeImages.length > 1;

  const galleryData = safeImages.map((img, index) => ({
    src: getDetailImageUrl(img),
    lightboxSrc: getLightboxImageUrl(img),
    alt: safeImages.length > 1 ? `${productName} (image ${index + 1} of ${safeImages.length})` : productName,
    original: img,
  }));

  const innerHtml = `
      <div class="product-details__main-wrap">
        ${
          hasMultiple
            ? `<button type="button" class="product-details__nav product-details__nav--prev" data-action="gallery-prev" aria-label="Previous product image">&lsaquo;</button>`
            : ""
        }
        <button
          type="button"
          class="product-details__main-image-btn"
          data-action="view-larger-image"
          aria-label="View larger image of ${escapeHtml(productName)}"
        >
          <img
            class="product-details__main-image"
            src="${galleryData[0].src}"
            data-original-src="${safeImages[0]}"
            alt="${escapeHtml(galleryData[0].alt)}"
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
              ${safeImages
                .map(
                  (img, index) =>
                    `<button
                      type="button"
                      class="product-details__thumb-btn${index === 0 ? " is-active" : ""}"
                      data-action="gallery-select"
                      data-index="${index}"
                      aria-label="View image ${index + 1} of ${escapeHtml(productName)}"
                      aria-current="${index === 0}"
                    >
                      <img class="product-details__thumb" src="${getGalleryThumbUrl(img)}" alt="${escapeHtml(productName)} thumbnail ${index + 1}" width="64" height="64" loading="lazy" decoding="async" />
                    </button>`
                )
                .join("")}
            </div>
          `
          : ""
      }
    `;

  return { innerHtml, galleryData };
}
