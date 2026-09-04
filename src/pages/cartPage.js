// Shopping cart page. Reads the live cart from Local Storage (via
// cart.js) on every render, so it's always showing current state —
// including right after a quantity/remove/clear action re-renders it
// in place (see rerenderCurrentRoute in js/app.js).

import { getCartSummary, getUnavailableCartItems, addToCart } from "../js/cart.js";
import { renderCartItem } from "../components/cartItem.js";
import { renderOrderSummary, getRegistrationDeliveryPrompt } from "../components/orderSummary.js";
import { renderEmptyState } from "../components/filterBar.js";
import { renderCartCompositionNotice } from "../components/cartCompositionNotice.js";
import { getCatalog } from "../js/api/productsApi.js";
import { getCurrentCustomer, recoverCheckoutIntent } from "../js/api/customerApi.js";
import { getLatestPreorderReleaseAt, preorderShipTogetherNotice } from "../js/preorder.js";

// Version 7, Milestone 129 (pattern), Milestone 180, Part A: best-effort
// only — being logged out (or the request failing) is never an error on
// the cart page, just the ordinary guest state. Never throws. Mirrors
// checkoutPage.js's own getLoggedInCustomerSafely() exactly.
async function isRegisteredCustomerSafely() {
  try {
    const response = await getCurrentCustomer();
    return Boolean(response?.data?.customer);
  } catch {
    return false;
  }
}

// Version 7, Milestone 174C, brief section 35: /cart?recover=<token>
// (the abandoned-checkout reminder email's own link) merges the
// recovered product references into this browser's own Local Storage
// cart, then falls through to the page's normal render — never trusts
// a price from the recovery response (it doesn't return one at all;
// see checkoutIntent.service.ts's own getRecoverableCartByToken()),
// so every price/stock fact is re-derived live exactly like any other
// cart item. Best-effort: an invalid/expired token, or a network
// failure, just means nothing gets merged — never a broken page.
async function mergeRecoveredCartIfPresent() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("recover");
  if (!token) return;

  try {
    const response = await recoverCheckoutIntent(token);
    const items = response?.data?.items || [];
    for (const item of items) {
      addToCart({ productId: item.productSlug, slug: item.productSlug, name: item.productName, price: item.price, image: item.image, productType: "PHYSICAL" }, item.quantity);
    }
  } catch {
    // Invalid/expired token — nothing to merge, cart page renders normally.
  }
}

// Version 7, Milestone 168C: the cart page used to show a
// representative delivery-fee estimate (Courier Guy Door to Door)
// before the customer had chosen a method.
// Version 7, Milestone 171F: removed entirely — live owner review of
// 171E found this estimate itself misleading (e.g. "Delivery R120"
// displayed on the cart page reads as an already-decided charge, even
// though the customer hasn't reached the delivery-method selector at
// checkout yet — see checkoutPage.js). getCartSummary() with no
// argument now gives deliveryFee: null for any cart with a physical
// item (see js/cart.js), and renderOrderSummary's own
// omitDeliveryUntilSelected option (below) removes the Delivery row
// from this page entirely rather than showing a "select a method"
// prompt — this page has no delivery-method selector to point at.
export async function renderCartPage() {
  // Version 7, Milestone 180, Part A: resolved once, up front, so both
  // the delivery-fee estimate below and the registration prompt use
  // the exact same server-verified fact, never two separate guesses.
  const isRegisteredCustomer = await isRegisteredCustomerSafely();
  const { items, subtotal, giftWrapTotal, deliveryFee, physicalSubtotal, composition } = getCartSummary(null, isRegisteredCustomer);

  if (!items.length) {
    return `
      <section class="stub-page container">
        <h1 class="stub-page__title">Your Cart</h1>
        ${renderEmptyState({
          title: "Your cart is empty",
          message: "Looks like you haven't added anything yet.",
          actionHref: "/shop",
          actionLabel: "Continue Shopping",
        })}
      </section>
    `;
  }

  // Version 7, Milestone 171E: cross-checks every cart line against
  // live product data (the same catalogue shop/homepage/product pages
  // already use) so a line that's sold out since it was added shows a
  // clear "Out of Stock" badge and blocks "Proceed to Checkout" — see
  // cart.js's getUnavailableCartItems(). Best-effort: a slow/failed
  // fetch just means staleness can't be detected on this page load, it
  // never blocks the cart page itself (the backend's own authoritative
  // check at order-creation time still protects the order regardless).
  let unavailableLineIds = new Set();
  let liveProductsBySlug = new Map();
  try {
    const { products } = await getCatalog();
    liveProductsBySlug = new Map(
      products.map((product) => [
        product.slug,
        {
          stockStatus: product.stockStatus,
          stockQuantity: product.stockQuantity,
          productType: product.productType,
          isPreorder: product.isPreorder,
          preorderReleaseAt: product.preorderReleaseAt,
        },
      ])
    );
    unavailableLineIds = new Set(getUnavailableCartItems(items, liveProductsBySlug).map((item) => item.lineId));
  } catch {
    unavailableLineIds = new Set();
  }

  // Milestone 181, Part K: the LIVE preorder status/release date (never
  // the cart line's own possibly-stale snapshot — see cart.js's own
  // comment) decides both each line's badge and the ship-together
  // notice below. A line whose Product has since left the catalogue
  // entirely (already flagged unavailable above) simply shows no
  // preorder badge, which is fine — it's blocking checkout regardless.
  const preorderDisplayItems = items.map((item) => ({
    isPreorder: liveProductsBySlug.get(item.slug)?.isPreorder ?? false,
    preorderReleaseAt: liveProductsBySlug.get(item.slug)?.preorderReleaseAt ?? null,
  }));
  const latestPreorderReleaseAt = getLatestPreorderReleaseAt(preorderDisplayItems);

  // Version 7, Milestone 180, Part A, section 12: a soft, easy-to-ignore
  // nudge, never a popup or a requirement — null (nothing rendered) for
  // a digital-only cart or a guest already getting free delivery under
  // the ordinary R600 threshold. See orderSummary.js's own comment.
  const registrationPrompt = getRegistrationDeliveryPrompt({ isRegisteredCustomer, physicalSubtotal, hasPhysicalItems: composition.hasPhysical });

  return `
    <section class="container cart-page">
      <h1 class="stub-page__title">Your Cart</h1>
      ${renderCartCompositionNotice(composition)}
      ${
        latestPreorderReleaseAt
          ? `
        <div class="demo-notice" data-cart-preorder-notice>
          <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
          <div><p>${preorderShipTogetherNotice(latestPreorderReleaseAt)}</p></div>
        </div>
      `
          : ""
      }
      ${
        registrationPrompt
          ? `
        <div class="demo-notice" data-cart-delivery-prompt>
          <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
          <div><p>${registrationPrompt}</p></div>
        </div>
      `
          : ""
      }

      <div class="cart-layout">
        <div class="cart-items">
          <div class="cart-items__header">
            <span>${items.length} item${items.length === 1 ? "" : "s"} in your cart</span>
            <button type="button" class="list-clear-btn" data-action="clear-cart">Clear Cart</button>
          </div>

          ${items
            .map((item, index) =>
              renderCartItem(item, {
                eager: index < 2,
                unavailable: unavailableLineIds.has(item.lineId),
                // Milestone 181, Part J: an active preorder line is never
                // capped by ordinary stockQuantity — no real quantity
                // limit feature exists this milestone, so it's simply
                // unbounded here (the backend independently re-verifies
                // at order-creation time regardless).
                maxQuantity: liveProductsBySlug.get(item.slug)?.isPreorder ? Infinity : liveProductsBySlug.get(item.slug)?.stockQuantity ?? Infinity,
                isPreorder: liveProductsBySlug.get(item.slug)?.isPreorder ?? false,
                preorderReleaseAt: liveProductsBySlug.get(item.slug)?.preorderReleaseAt ?? null,
              })
            )
            .join("")}

          <a class="cart-page__continue" href="/shop">&larr; Continue Shopping</a>
        </div>

        ${renderOrderSummary({ subtotal, giftWrapTotal, deliveryFee, hasPhysicalItems: composition.hasPhysical, checkoutBlocked: unavailableLineIds.size > 0, omitDeliveryUntilSelected: true, isRegisteredCustomer })}
      </div>
    </section>
  `;
}
