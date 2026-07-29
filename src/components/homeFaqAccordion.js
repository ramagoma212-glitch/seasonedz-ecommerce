// Version 7, Milestone 150: homepage FAQ accordion. Deliberately a
// separate, purpose-built component from pages/faq.js's own
// <details>/<summary> accordion (which stays untouched and working) —
// this one uses the real-<button> + aria-expanded/aria-controls
// pattern the homepage brief specifically asked for. Toggle behaviour
// is wired up via delegated click handling in js/app.js
// (data-action="toggle-faq"), the same delegation pattern every other
// interactive homepage control already uses.
import { STANDARD_DELIVERY_FEE, REGISTERED_FREE_DELIVERY_THRESHOLD } from "../js/cart.js";
import { businessInfo } from "../data/businessInfo.js";

function buildHomeFaqs() {
  return [
    {
      id: "buy-where",
      question: "Where can I buy Seasonedz Group products?",
      answer:
        "You can shop directly through our website. Selected products are also available on Takealot, Amazon.co.za and Amazon.com.",
    },
    {
      id: "delivery",
      question: "Do you deliver across South Africa?",
      answer: `Yes, we deliver nationwide across South Africa. Standard delivery is R${STANDARD_DELIVERY_FEE}, and registered customers receive free delivery on orders of R${REGISTERED_FREE_DELIVERY_THRESHOLD} or more.`,
    },
    {
      id: "ages",
      question: "What age groups are the books suitable for?",
      answer:
        "Our ABC Colouring Book is made for preschool, Grade R and early primary learners. The Little Hands, Big Faith Bible colouring books are designed for children aged 6 to 10. Our Mindfulness Colouring Book is created for adults.",
    },
    {
      id: "digital",
      question: "How do digital downloads work?",
      answer: "Digital editions are being prepared. Subscribe below to receive an update when they become available.",
    },
    {
      id: "schools",
      question: "Can schools and churches place larger orders?",
      answer: `Yes. Schools, churches and organisations can <a href="/schools">contact Seasonedz Group</a> for larger orders, classroom packs and product enquiries.`,
    },
    {
      id: "contact",
      question: "How can I contact Seasonedz Group?",
      answer: `You can reach us by email at <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a>, by WhatsApp or phone at <a href="${businessInfo.telUrl}">${businessInfo.phoneDisplay}</a>, or through our <a href="/contact">Contact page</a>.`,
    },
  ];
}

export function renderHomeFaqSection() {
  const items = buildHomeFaqs();

  return `
    <section class="section container">
      <div class="section__header">
        <h2>Frequently Asked Questions</h2>
      </div>
      <div class="home-faq" data-home-faq>
        ${items
          .map(
            (item, index) => `
              <div class="home-faq__item">
                <h3 class="home-faq__heading">
                  <button
                    type="button"
                    class="home-faq__trigger"
                    id="home-faq-trigger-${item.id}"
                    data-action="toggle-faq"
                    aria-expanded="false"
                    aria-controls="home-faq-panel-${item.id}"
                  >
                    <span>${item.question}</span>
                    <span class="home-faq__icon" aria-hidden="true">+</span>
                  </button>
                </h3>
                <div
                  class="home-faq__panel"
                  id="home-faq-panel-${item.id}"
                  role="region"
                  aria-labelledby="home-faq-trigger-${item.id}"
                  hidden
                >
                  <p>${item.answer}</p>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}
