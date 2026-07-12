// Policies hub page. The four legal-adjacent policies now have their
// own dedicated pages (shippingPolicy.js, returnsPolicy.js,
// privacyPolicy.js, terms.js, cookiesPolicy.js) — this page is just a
// simple index linking out to them, kept around since it's still a
// reasonable landing spot for anyone who lands on #/policies directly.

const POLICY_LINKS = [
  { href: "#/shipping-policy", label: "Shipping Policy", description: "Delivery fees, timing and tracking." },
  { href: "#/returns-policy", label: "Returns Policy", description: "Damaged, incorrect or unwanted items." },
  { href: "#/privacy-policy", label: "Privacy Policy", description: "How your information is handled." },
  { href: "#/terms", label: "Terms & Conditions", description: "The basics of using this website." },
  { href: "#/cookies-policy", label: "Cookies Policy", description: "Local Storage and browser data." },
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
