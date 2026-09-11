// Milestone 181A: the shared "first-preorder discount" progress notice,
// used by both cartPage.js and checkoutPage.js (previously duplicated
// only on Checkout — Part G of the brief now wants the same messaging
// on Cart too). `preview` is always the real, backend-authoritative
// PreorderDiscountPreviewResult (order.service.ts's previewPreorderDiscount())
// — qualifies/discountPercent/eligibleSubtotal/minimumEligibleSubtotal
// all come from there, never computed or guessed here. This file only
// ever formats what the backend already decided.
//
// Precedence (matches the backend's own order.service.ts precedence):
// already-used beats below-minimum — a customer who has genuinely used
// the benefit must never see a misleading "add RXX more" that implies
// spending more would still unlock a discount they can no longer get.

function formatRand(amount) {
  return `R${Number(amount).toFixed(2)}`;
}

// `hasEligibleItems`: true when the cart/checkout items contain at
// least one Product flagged isPreorderDiscountEligible (computed by
// the caller from live catalogue data) — this alone decides whether
// this notice has anything preorder-related to say at all; `preview`
// decides which specific message.
export function renderPreorderDiscountNotice({ isRegisteredCustomer, hasEligibleItems, preview, dataAttribute }) {
  if (!hasEligibleItems || !preview) return "";

  const attr = dataAttribute ? ` ${dataAttribute}` : "";
  const minimumText = `${formatRand(preview.minimumEligibleSubtotal)} or more`;

  if (!isRegisteredCustomer) {
    return `
      <div class="demo-notice"${attr}>
        <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
        <div><p>Create an account or sign in to get ${preview.discountPercent}% off your first qualifying preorder of ${minimumText}.</p></div>
      </div>
    `;
  }

  if (preview.alreadyUsed) {
    return `
      <div class="demo-notice"${attr}>
        <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
        <div><p>You have already used your first-preorder discount on a previous order.</p></div>
      </div>
    `;
  }

  if (!preview.qualifies) {
    const remaining = Math.max(0, Number(preview.minimumEligibleSubtotal) - Number(preview.eligibleSubtotal));
    if (remaining > 0) {
      return `
        <div class="demo-notice"${attr}>
          <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
          <div><p>Add ${formatRand(remaining)} more in eligible preorder items to qualify for ${preview.discountPercent}% off your first preorder.</p></div>
        </div>
      `;
    }
    return "";
  }

  // Already qualifying — the actual discount is shown in the order
  // summary's own "First preorder discount" row (Part H), never
  // repeated here.
  return "";
}
