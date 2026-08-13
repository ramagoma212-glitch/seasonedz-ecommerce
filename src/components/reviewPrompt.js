// Version 7, Milestone 171C: genuine product review submission —
// shown on the customer's own Order Detail page (accountOrderDetail.js),
// per Part H of the milestone brief ("Prefer placing it naturally
// within: My Account / Orders / Order Details"). Every candidate here
// came from GET /api/customers/reviews/eligible, which the backend
// only ever populates from real PAID OrderItems the logged-in customer
// hasn't already reviewed — this file has no way to show a "Write a
// Review" prompt for a product that wasn't genuinely purchased.
import { escapeHtml } from "../js/search.js";

const STATUS_LABEL = {
  PENDING: "Pending approval",
  APPROVED: "Published",
  REJECTED: "Not approved",
};

function renderSubmittedReviewRow(review) {
  return `
    <div class="review-prompt review-prompt--submitted">
      <p class="review-prompt__product">${escapeHtml(review.productName)}</p>
      <span class="badge">Your review: ${STATUS_LABEL[review.status] || escapeHtml(review.status)}</span>
    </div>
  `;
}

function renderReviewPromptRow(candidate) {
  const formId = `review-form-${candidate.orderItemId}`;
  return `
    <div class="review-prompt" data-review-prompt data-order-item-id="${escapeHtml(candidate.orderItemId)}">
      <div class="review-prompt__header">
        <p class="review-prompt__product">${escapeHtml(candidate.productName)}</p>
        <button type="button" class="btn btn--secondary btn--sm" data-action="toggle-review-form" aria-expanded="false" aria-controls="${formId}">Write a Review</button>
      </div>
      <form class="review-form" id="${formId}" data-review-form data-order-item-id="${escapeHtml(candidate.orderItemId)}" novalidate hidden>
        <div class="form-field">
          <label class="form-field__label" for="rating-${candidate.orderItemId}">
            Rating <span class="form-field__required" aria-hidden="true">*</span>
          </label>
          <select id="rating-${candidate.orderItemId}" name="rating" class="form-field__input" required>
            <option value="">Select a rating</option>
            <option value="5">5 - Excellent</option>
            <option value="4">4 - Good</option>
            <option value="3">3 - Average</option>
            <option value="2">2 - Poor</option>
            <option value="1">1 - Very Poor</option>
          </select>
          <span class="form-field__error" data-error-for="rating-${candidate.orderItemId}"></span>
        </div>
        <div class="form-field">
          <label class="form-field__label" for="text-${candidate.orderItemId}">
            Your Review <span class="form-field__required" aria-hidden="true">*</span>
          </label>
          <textarea
            id="text-${candidate.orderItemId}"
            name="reviewText"
            class="form-field__input form-field__textarea"
            rows="4"
            minlength="10"
            maxlength="2000"
            required
            placeholder="What did you think of this product?"
          ></textarea>
          <span class="form-field__error" data-error-for="text-${candidate.orderItemId}"></span>
        </div>
        <div class="form-banner" data-review-form-banner hidden></div>
        <button type="submit" class="btn btn--primary btn--sm">Submit Review</button>
      </form>
    </div>
  `;
}

export function renderReviewPromptsCard(eligibleCandidates, myReviews) {
  if (eligibleCandidates.length === 0 && myReviews.length === 0) return "";

  return `
    <div class="order-confirmation__card">
      <h3>Reviews</h3>
      ${myReviews.map(renderSubmittedReviewRow).join("")}
      ${eligibleCandidates.map(renderReviewPromptRow).join("")}
    </div>
  `;
}
