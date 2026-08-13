// Version 7, Milestone 171C: genuine, approved-only product reviews —
// the public display half (product detail page). Every review shown
// here came from getProductReviews() (js/api/productsApi.js), which
// calls the public GET /api/products/:slug/reviews endpoint — that
// endpoint only ever returns APPROVED reviews (enforced server-side,
// see backend/src/services/productReview.service.ts), so there is
// nothing for this file to filter or hide. A product with zero
// approved reviews shows a plain, truthful empty state — never a fake
// "0.0 / 5" rating or invented content.
import { escapeHtml } from "../js/search.js";
import { renderStars } from "./productCard.js";

function formatReviewDate(isoString) {
  return new Date(isoString).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });
}

function renderReviewCard(review) {
  return `
    <div class="product-review-card">
      ${renderStars(review.rating)}
      <p class="product-review-card__text">${escapeHtml(review.reviewText)}</p>
      <p class="product-review-card__meta">
        <span class="product-review-card__name">${escapeHtml(review.displayName)}</span>
        &middot;
        <span class="product-review-card__date">${formatReviewDate(review.createdAt)}</span>
      </p>
    </div>
  `;
}

// `product` is the same frontend product shape already used everywhere
// else on this page — `rating` (mapped from the backend's own
// `ratingAverage` field, see js/api/mappers.js) and `reviewCount` are
// real, existing fields (schema.prisma's own comment always called
// them "aggregate fields, recalculated whenever a future Review model
// is added" — this milestone is that model). `reviewData` is the
// paginated getProductReviews() response for this same product.
export function renderProductReviewsSection(product, reviewData) {
  const { reviews, total } = reviewData;
  const hasApprovedReviews = product.reviewCount > 0;

  return `
    <section class="product-reviews" aria-labelledby="product-reviews-heading">
      <h2 id="product-reviews-heading">Customer Reviews</h2>
      ${
        hasApprovedReviews
          ? `
        <div class="product-reviews__summary">
          ${renderStars(product.rating)}
          <span class="product-reviews__average">${product.rating.toFixed(1)} out of 5</span>
          <span class="product-reviews__count">(${product.reviewCount} review${product.reviewCount === 1 ? "" : "s"})</span>
        </div>
      `
          : `<p class="product-reviews__empty">No customer reviews yet.</p>`
      }
      ${
        reviews.length > 0
          ? `<div class="product-reviews__list">${reviews.map(renderReviewCard).join("")}</div>`
          : ""
      }
      ${
        total > reviews.length
          ? `<p class="product-reviews__more-note">Showing ${reviews.length} of ${total} reviews.</p>`
          : ""
      }
    </section>
  `;
}
