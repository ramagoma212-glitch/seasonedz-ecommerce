// Policies hub page. The five legal-adjacent policies each have their
// own dedicated page (shippingPolicy.js, returnsPolicy.js,
// privacyPolicy.js, terms.js, cookiesPolicy.js). This page is just a
// simple index linking out to them, kept around since it's still a
// reasonable landing spot for anyone who lands on #/policies directly.
//
// Owner content update (24 August 2026): labels and descriptions
// brought in line with the new owner-approved legal pages.

const POLICY_LINKS = [
  { href: "/shipping-policy", label: "Shipping Policy", description: "Delivery fees, timing and tracking." },
  { href: "/returns-policy", label: "Returns, Refunds and Exchanges", description: "Damaged, incorrect, defective or unwanted items." },
  { href: "/privacy-policy", label: "Privacy Policy", description: "How your information is collected, used and protected." },
  { href: "/terms", label: "Terms and Conditions", description: "The terms that apply when you use this website." },
  { href: "/cookies-policy", label: "Cookie Policy", description: "Cookies, Local Storage and your consent preferences." },
];

export function renderPolicies() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Policies</h1>
      <p class="stub-page__text">Everything you need to know about shopping with Seasonedz Group.</p>

      <div class="grid grid--3 policies-grid">
        ${POLICY_LINKS.map(
          (policy) => `
            <a class="card policy-card" href="${policy.href}">
              <div class="card__body">
                <h3 class="card__title">${policy.label}</h3>
                <p class="card__subtitle">${policy.description}</p>
              </div>
            </a>
          `
        ).join("")}
      </div>
    </section>
  `;
}
