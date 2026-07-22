// FAQ page. Groups the questions from data/faqs.js by category and
// renders each as a native <details>/<summary> accordion item — that
// gives expand/collapse behaviour with full keyboard and screen-reader
// support for free, with no custom JS needed.

import { faqs } from "../data/faqs.js";

function groupByCategory(items) {
  const groups = new Map();

  items.forEach((item) => {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  });

  return groups;
}

export function renderFaq() {
  const groups = groupByCategory(faqs);

  const sections = [...groups.entries()]
    .map(
      ([category, items]) => `
        <div class="faq-category">
          <h2 class="faq-category__title">${category}</h2>
          <div class="faq-list">
            ${items
              .map(
                (faq) => `
                  <details class="faq-item">
                    <summary class="faq-item__question">${faq.question}</summary>
                    <p class="faq-item__answer">${faq.answer}</p>
                  </details>
                `
              )
              .join("")}
          </div>
        </div>
      `
    )
    .join("");

  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Frequently Asked Questions</h1>
      <p class="stub-page__text">
        Answers to common questions about ordering, delivery, payment,
        returns and more. Can't find what you're looking for?
        <a href="/contact">Contact us</a>.
      </p>

      <div class="faq-page">
        ${sections}
      </div>
    </section>
  `;
}
