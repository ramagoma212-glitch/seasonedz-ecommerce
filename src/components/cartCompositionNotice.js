// Version 7, Milestone 152: shared cart/checkout notice about physical
// delivery vs. digital download access, based on cart.js's own
// getCartComposition(). Shown on both the cart and checkout pages so
// the messaging never drifts between the two.

export function renderCartCompositionNotice(composition) {
  if (!composition || (!composition.isDigitalOnly && !composition.isMixed)) return "";

  if (composition.isDigitalOnly) {
    return `
      <div class="demo-notice cart-composition-notice">
        <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
        <div>
          <strong>No physical delivery is required for digital downloads.</strong>
          <p>Your digital download(s) will be available after payment is confirmed.</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="demo-notice cart-composition-notice">
      <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
      <div>
        <strong>Physical items will be delivered. Digital items will be available after payment.</strong>
      </div>
    </div>
  `;
}
