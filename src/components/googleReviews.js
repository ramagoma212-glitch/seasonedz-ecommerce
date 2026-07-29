// Version 7, Milestone 150: homepage Google Reviews section. Never
// fabricates a star rating, review count, reviewer name, review text,
// or a guessed Google link — those must be real and owner-verified.
// While businessInfo.googleReviewsUrl is null (no verified link has
// ever been supplied), this renders nothing at all, the same "no
// empty placeholder" rule this site already applies to the blog
// section rather than showing a hollow/fake-looking block.
import { businessInfo } from "../data/businessInfo.js";

export function renderGoogleReviewsSection() {
  if (!businessInfo.googleReviewsUrl) return "";

  return `
    <section class="section container">
      <div class="google-reviews">
        <div class="section__header">
          <h2>Reviews</h2>
          <p>See what customers are saying about Seasonedz Group on Google.</p>
        </div>
        <a
          class="btn btn--secondary"
          href="${businessInfo.googleReviewsUrl}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Read Seasonedz Group reviews on Google (opens in a new tab)"
        >Read Our Google Reviews</a>
      </div>
    </section>
  `;
}
