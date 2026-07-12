// Policies page. Placeholder copy for Privacy Policy, Terms & Conditions,
// Shipping Policy and Returns Policy — all linked from the footer.
// Real legal copy will replace these placeholders before launch.

export function renderPolicies() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Policies</h1>

      <div class="placeholder-panel">
        <h3>Privacy Policy</h3>
        <p>Full privacy policy text coming soon.</p>
      </div>

      <div class="placeholder-panel">
        <h3>Terms &amp; Conditions</h3>
        <p>Full terms and conditions text coming soon.</p>
      </div>

      <div class="placeholder-panel">
        <h3>Shipping Policy</h3>
        <p>Shipping and courier details coming soon.</p>
      </div>

      <div class="placeholder-panel">
        <h3>Returns Policy</h3>
        <p>Returns and refunds process coming soon.</p>
      </div>
    </section>
  `;
}
