// FAQ page. Renders the sample question/answer pairs from data/faqs.js.

import { faqs } from "../data/faqs.js";

export function renderFaq() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Frequently Asked Questions</h1>
      <div class="grid grid--2">
        ${faqs
          .map(
            (faq) => `
              <div class="card">
                <div class="card__body">
                  <h3 class="card__title">${faq.question}</h3>
                  <p>${faq.answer}</p>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}
