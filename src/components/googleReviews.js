// Version 7, Milestone 150: homepage Google Reviews section. Never
// fabricates a star rating, review count, reviewer name or review
// text — only real, owner-verified links exist for this, so the copy
// stays purely link-oriented (no invented testimonial content), and
// no AggregateRating/Review structured data is added anywhere for the
// same reason. While businessInfo.googleReviewsUrl is null, this
// renders nothing at all, the same "no empty placeholder" rule this
// site already applies to the blog section rather than showing a
// hollow/fake-looking block.
import { businessInfo } from "../data/businessInfo.js";

export function renderGoogleReviewsSection() {
  if (!businessInfo.googleReviewsUrl) return "";

  return `
    <section class="section container">
      <div class="google-reviews">
        <div class="section__header">
          <h2>Loved by Our Customers</h2>
          <p>See what customers are saying about Seasonedz Group books and creative products.</p>
          <p>Your support helps our small South African brand grow.</p>
        </div>
        <p class="google-reviews__body">Read our latest customer feedback on Google.</p>
        <div class="google-reviews__actions">
          <a
            class="btn btn--secondary"
            href="${businessInfo.googleReviewsUrl}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Read Seasonedz Group reviews on Google (opens in a new tab)"
          >Read Our Google Reviews</a>
          ${
            businessInfo.googleReviewRequestUrl
              ? `
          <a
            class="btn btn--primary"
            href="${businessInfo.googleReviewRequestUrl}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Leave a Google review for Seasonedz Group (opens in a new tab)"
          >Leave a Google Review</a>
          `
              : ""
          }
        </div>
      </div>
    </section>
  `;
}
