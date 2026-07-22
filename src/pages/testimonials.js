// Testimonials page. Renders the sample reviews from data/testimonials.js
// and is explicit that they are sample content for this preview site,
// not verified customer reviews.

import { testimonials } from "../data/testimonials.js";
import { renderStars } from "../components/productCard.js";

function renderTestimonialCard(testimonial) {
  return `
    <div class="card testimonial-card">
      <div class="card__body">
        <span class="badge testimonial-card__category">${testimonial.category}</span>
        ${renderStars(testimonial.rating)}
        <p class="testimonial-card__message">&ldquo;${testimonial.message}&rdquo;</p>
        <p class="testimonial-card__name">${testimonial.name}</p>
        <p class="testimonial-card__role">${testimonial.role}</p>
      </div>
    </div>
  `;
}

export function renderTestimonials() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Testimonials</h1>
      <p class="stub-page__text">
        What parents, teachers, churches and mindfulness colouring fans
        might say about Seasonedz Group.
      </p>

      <div class="demo-notice">
        <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
        <div>
          <strong>Sample Content</strong>
          <p>
            These are sample testimonials written for this preview site,
            not verified customer reviews. They'll be replaced with real
            feedback as Seasonedz Group receives it.
          </p>
        </div>
      </div>

      <div class="grid grid--2 testimonials-grid">
        ${testimonials.map((testimonial) => renderTestimonialCard(testimonial)).join("")}
      </div>

      <div class="info-page__cta">
        <h2>Have Feedback to Share?</h2>
        <p>We'd love to hear from you once you've tried our products.</p>
        <a class="btn btn--primary" href="/contact">Contact Us</a>
      </div>
    </section>
  `;
}
