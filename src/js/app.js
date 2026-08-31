// Application entry point.
// Mounts the header and footer once, creates the #main-content outlet
// the router renders pages into, and wires up global UI behaviour:
// the mobile menu toggle, the header search form, shop/search filter
// and sort controls, the quantity selector on the product details page,
// cart/wishlist actions, the guest checkout form, the order tracking
// form, demo enquiry forms (contact/schools/wholesale/distributor),
// header badge counters, toast feedback, and the product image
// lightbox.

import { renderHeader } from "../components/header.js";
import { renderFooter } from "../components/footer.js";
import { initRouter, rerenderCurrentRoute } from "./router.js";
import { navigateTo } from "./navigation.js";
import {
  addToCart,
  removeFromCart,
  increaseCartQuantity,
  decreaseCartQuantity,
  updateCartQuantity,
  clearCart,
  getCart,
  getCartItemCount,
} from "./cart.js";
import { toggleWishlist, removeFromWishlist, clearWishlist, getWishlistCount, getWishlist } from "./wishlist.js";
import {
  validateCheckoutForm,
  validateCustomerLoginForm,
  validateCustomerRegisterForm,
  validateForgotPasswordForm,
  validateResetPasswordForm,
  validateAdminSetPasswordForm,
  isValidEmail,
} from "./validation.js";
import { ApiError, ApiUnavailableError } from "./apiClient.js";
import { buildOrderPayload, createOrder } from "./api/ordersApi.js";
import { clearReferralAttribution, markReferralAttributionPendingOrder } from "./referral.js";
import { submitEnquiry } from "./api/enquiriesApi.js";
import { subscribeToNewsletter } from "./api/newsletterApi.js";
import { retryPayfastPayment } from "./payfastRetry.js";
import {
  adminLogin,
  adminLogout,
  adminVerifyOtp,
  adminResendOtp,
  adminLogoutAllSessions,
  adminForgotPassword,
  adminResetPassword,
  activateAdminInvitation,
} from "./api/adminAuthApi.js";
import { inviteAdminUser, reissueAdminInvitation, changeAdminUserRole, setAdminUserActive } from "./api/adminUsersApi.js";
import {
  registerCustomer,
  loginCustomer,
  logoutCustomer,
  forgotPassword,
  resetPassword,
  requestCustomerDownload,
  submitProductReview,
  applyForAffiliateProgramme,
  markNotificationRead,
  markAllNotificationsRead,
  updateMyNotificationPreferences,
  subscribeToStockAlert,
  addToServerWishlist,
  removeFromServerWishlist,
  mergeGuestWishlist,
  captureCheckoutIntent,
  updateMyAffiliateApplication,
  submitMyAffiliateApplication,
  uploadMyAffiliateDocument,
} from "./api/customerApi.js";
import { disconnectProvider } from "./api/socialAuthApi.js";
import { requestGuestDownload } from "./api/guestDownloadApi.js";
import {
  updateAdminOrderStatus,
  updateAdminShipping,
  getAdminCourierQuote,
  bookAdminCourier,
  createAdminProduct,
  updateAdminProduct,
  getAdminProducts,
  uploadProductImage,
  updateProductImage,
  deleteProductImage,
  uploadAdminDigitalAsset,
  deleteAdminDigitalAsset,
  approveAdminReview,
  rejectAdminReview,
  confirmAdminManualPayment,
} from "./api/adminDashboardApi.js";
import {
  createAdminAffiliateProduct,
  updateAdminAffiliateProduct,
  activateAdminAffiliateProduct,
  deactivateAdminAffiliateProduct,
  featureAdminAffiliateProduct,
  unfeatureAdminAffiliateProduct,
} from "./api/adminAffiliateApi.js";
import {
  createAdminAffiliate,
  updateAdminAffiliate,
  approveAdminAffiliate,
  rejectAdminAffiliate,
  suspendAdminAffiliate,
  reactivateAdminAffiliate,
  updateReferralSettings,
  approveAdminReferralCommission,
  reverseAdminReferralCommission,
  payAdminAffiliateCommissions,
  createAdminAffiliateProductSetting,
  updateAdminAffiliateProductSetting,
  deleteAdminAffiliateProductSetting,
} from "./api/adminReferralsApi.js";
import { renderProductSearchResults, renderSelectedProductPreview } from "../pages/adminReferralAffiliateProductForm.js";
import {
  createAdminBrandKnowledgeEntry,
  updateAdminBrandKnowledgeEntry,
  deactivateAdminBrandKnowledgeEntry,
  reactivateAdminBrandKnowledgeEntry,
  createAdminContentPillar,
  updateAdminContentPillar,
  deactivateAdminContentPillar,
  reactivateAdminContentPillar,
  createAdminAudience,
  updateAdminAudience,
  deactivateAdminAudience,
  reactivateAdminAudience,
  previewContentContext,
} from "./api/contentStudioApi.js";
import { renderContextPreviewResult } from "../pages/adminContentContextPreview.js";
import {
  requestAdminAffiliateApplicationCorrection,
  approveAdminAffiliateApplication,
  rejectAdminAffiliateApplication,
  revealAdminAffiliateApplicationIdentityNumber,
  getAdminAffiliateApplicationDocumentSignedUrl,
} from "./api/adminAffiliateApplicationsApi.js";
import { isUnauthenticated, redirectToAdminLogin, setPendingAdminMessage } from "./adminGuard.js";
import { humanizeEnum } from "./adminFormat.js";
import { FREE_DELIVERY_THRESHOLD, REGISTERED_FREE_DELIVERY_THRESHOLD, COURIER_LOCKER_FEE, COURIER_DOOR_FEE, getDeliveryMethodLabel } from "../config/delivery.js";
import { getDeliveryNote } from "../components/orderSummary.js";
import { escapeHtml } from "./search.js";
import { setupDescriptionEditors, getDescriptionVisibleCharacterCount, MAX_DESCRIPTION_VISIBLE_CHARACTERS } from "./descriptionEditor.js";
import { getConsent, needsConsentPrompt, acceptAllConsent, rejectNonEssentialConsent, saveConsent } from "./consent.js";
import { renderCookieConsentBanner, renderCookiePreferencesModal } from "../components/cookieConsent.js";
import { setupPasswordVisibilityToggles } from "./passwordToggle.js";

function mountApp() {
  const app = document.getElementById("app");
  if (!app) return;

  app.insertAdjacentHTML("afterbegin", renderHeader());
  app.insertAdjacentHTML("beforeend", '<main id="main-content"></main>');
  app.insertAdjacentHTML("beforeend", renderFooter());

  // Version 7, Milestone 171H: initialized before initRouter() and
  // every other feature below — this is where a future optional
  // analytics/marketing script would first become able to check
  // consent (see js/consent.js's hasConsent()/subscribeToConsentChanges()),
  // so it must run before anything else has a chance to load one.
  // Seasonedz has zero such scripts today; this ordering is purely
  // future-readiness, not fixing an existing problem.
  setupCookieConsent();
  initRouter();
  setupMobileMenu();
  setupNavMoreMenu();
  setupImageFallback();
  setupHeaderSearch();
  setupFilterControls();
  setupCartQuantityInput();
  setupProductActions();
  setupProductImageLightbox();
  setupCheckoutForm();
  setupTrackOrderForm();
  setupNewsletterForm();
  setupEnquiryForms();
  setupCustomerAccountForms();
  setupAffiliateApplicationForm();
  setupPasswordVisibilityToggles();
  setupAdminLoginForm();
  setupAdminForgotPasswordForm();
  setupAdminResetPasswordForm();
  setupAdminActivateAccountForm();
  setupAdminUserInviteForm();
  setupAdminUserActions();
  setupAdminOrderStatusForm();
  setupAdminShippingForm();
  setupAdminCourierQuoteForm();
  setupAdminBookCourierArea();
  setupAdminProductFilterForm();
  setupAdminProductForm();
  setupAdminProductImages();
  setupAdminDigitalAsset();
  setupAdminReviewModeration();
  setupAdminAffiliateFilterForm();
  setupAdminAffiliateForm();
  setupAdminAffiliateActions();
  setupAdminReferralAffiliateFilterForm();
  setupAdminReferralAffiliateForm();
  setupAdminReferralAffiliateActions();
  setupAdminAffiliateProductSettingFilterForm();
  setupAdminAffiliateProductSettingForm();
  setupAdminAffiliateProductSettingActions();
  setupAdminAffiliateApplicationActions();
  setupAdminReferralSettingsForm();
  setupAdminCommissionFilterForm();
  setupAdminCommissionActions();
  setupAdminCommissionReverseForm();
  setupAdminPayoutActions();
  setupAdminPaymentConfirmation();
  setupDescriptionEditors();
  setupAdminBrandKnowledgeFilterForm();
  setupAdminBrandKnowledgeForm();
  setupAdminBrandKnowledgeActions();
  setupAdminContentPillarFilterForm();
  setupAdminContentPillarForm();
  setupAdminContentPillarActions();
  setupAdminAudienceFilterForm();
  setupAdminAudienceForm();
  setupAdminAudienceActions();
  setupAdminContextPreviewForm();

  window.addEventListener("popstate", onRouteChange);
  onRouteChange();
  updateHeaderCounters();
}

// The header is only rendered once at mount time (it never gets
// replaced like #main-content does), so it needs to be kept in sync
// with the route by hand: pre-fill the search box with the current
// ?q= term, and close the mobile menu after any navigation. Fires on
// "popstate" (Back/Forward, and every navigateTo() call — see
// js/navigation.js) as well as once directly at mount, matching the
// old hashchange-based behaviour.
function onRouteChange() {
  const input = document.querySelector(".site-header__search input[type=search]");
  if (input) {
    const params = new URLSearchParams(window.location.search);
    input.value = params.get("q") || "";
  }

  document.querySelector(".site-header__collapsible")?.classList.remove("is-open");
  document.querySelector(".site-header__mobile-toggle")?.setAttribute("aria-expanded", "false");
  closeNavMoreMenu();
}

// Version 7, Milestone 168C: the desktop "More" nav dropdown (see
// components/header.js's renderMoreMenu()). Closing on navigation
// mirrors the mobile panel's own onRouteChange() behaviour above — a
// selected destination should never leave a stale open dropdown behind.
function closeNavMoreMenu() {
  const trigger = document.getElementById("nav-more-trigger");
  const panel = document.getElementById("nav-more-panel");
  if (!trigger || !panel || panel.hidden) return;
  panel.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
}

// Click-outside-to-close and Escape-to-close (with focus return to the
// trigger, matching setupMobileMenu()'s own Escape behaviour) — the
// open/close-on-click-of-the-trigger-itself behaviour instead reuses
// the existing generic aria-expanded/hidden toggle idiom via
// data-action="toggle-nav-more" (see handleToggleNavMore, wired
// through setupProductActions()'s delegated click handler below).
function setupNavMoreMenu() {
  document.addEventListener("click", (event) => {
    const trigger = document.getElementById("nav-more-trigger");
    const panel = document.getElementById("nav-more-panel");
    if (!trigger || !panel || panel.hidden) return;
    if (trigger.contains(event.target) || panel.contains(event.target)) return;
    closeNavMoreMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const trigger = document.getElementById("nav-more-trigger");
    const panel = document.getElementById("nav-more-panel");
    if (!trigger || !panel || panel.hidden) return;
    closeNavMoreMenu();
    trigger.focus();
  });
}

// Version 7, Milestone 150: aria-expanded now tracks open state (was
// previously just a visual class toggle with no accessible state),
// and Escape closes the menu and returns focus to the toggle button —
// the standard expected behaviour for any disclosure/menu widget.
function setupMobileMenu() {
  const toggle = document.querySelector(".site-header__mobile-toggle");
  const panel = document.querySelector(".site-header__collapsible");
  if (!toggle || !panel) return;

  const setOpen = (isOpen) => {
    panel.classList.toggle("is-open", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
  };

  toggle.addEventListener("click", () => {
    setOpen(!panel.classList.contains("is-open"));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!panel.classList.contains("is-open")) return;
    setOpen(false);
    toggle.focus();
  });
}

// Version 7, Milestone 97: falls back to the original, untouched image
// URL if a Supabase transform URL (see js/imageTransforms.js) ever
// fails to load, so a transform-endpoint hiccup never shows a broken
// image. "error" doesn't bubble, so this listens on the capture phase
// at the document level instead of delegating the usual bubbling way
// — the only way to catch it from every <img> across every page
// without attaching a listener per-image. Checking `img.src ===
// original` before swapping avoids an infinite loop if the original
// URL also fails to load.
function setupImageFallback() {
  document.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;

      const original = img.dataset.originalSrc;
      if (!original || img.src === original) return;

      img.src = original;
    },
    true
  );
}

// Delegated so it keeps working no matter which page is currently
// rendered inside #main-content.
function setupHeaderSearch() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest(".site-header__search");
    if (!form) return;

    event.preventDefault();

    const input = form.querySelector("input[type=search]");
    const term = (input?.value || "").trim();
    if (!term) return; // ignore empty/whitespace-only searches

    navigateTo(`/search?q=${encodeURIComponent(term)}`);
  });
}

// Any <select data-filter="..."> (category/price/age/stock/tag/sort on
// the shop and search results pages) updates the URL query string in
// place, which re-triggers the router via navigateTo()'s popstate event.
function setupFilterControls() {
  document.addEventListener("change", (event) => {
    const filterEl = event.target.closest("[data-filter]");
    if (!filterEl) return;

    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    if (filterEl.value) {
      params.set(filterEl.dataset.filter, filterEl.value);
    } else {
      params.delete(filterEl.dataset.filter);
    }

    const nextQuery = params.toString();
    navigateTo(`${path}${nextQuery ? `?${nextQuery}` : ""}`);
  });
}

// Mobile "Show/Hide Filters" toggle (Version 7, Milestone 93B). Desktop
// never renders this button at all (see .filter-toggle in
// components.css), so this only ever runs on mobile/tablet widths.
// Purely a visibility toggle — no filter/sort logic here, that's still
// entirely setupFilterControls() above, unchanged.
function handleToggleMobileFilters(button) {
  const panelId = button.getAttribute("aria-controls");
  const panel = panelId ? document.getElementById(panelId) : null;
  if (!panel) return;

  const isOpen = panel.classList.toggle("is-open");
  button.setAttribute("aria-expanded", String(isOpen));

  const label = button.querySelector("[data-filter-toggle-label]");
  if (label) label.textContent = isOpen ? "Hide Filters" : "Show Filters";
}

// The cart page's quantity input (data-action="cart-update") is typed
// into directly, so it needs its own "change" handler rather than the
// click-based one below.
function setupCartQuantityInput() {
  document.addEventListener("change", (event) => {
    const input = event.target.closest('[data-action="cart-update"]');
    if (!input) return;

    const quantity = Math.max(1, parseInt(input.value, 10) || 1);
    // Version 7, Milestone 159: keyed by lineId, not productId — see
    // cart.js's own computeLineId comment. Identical to productId for
    // an unwrapped line, so this is a no-op change for every existing
    // (non-gift-wrapped) cart entry.
    updateCartQuantity(input.dataset.lineId, quantity);
    rerenderCurrentRoute();
    updateHeaderCounters();
  });
}

// Reads the product fields a card/details/wishlist button carries in
// its data-* attributes, in the shape cart.js/wishlist.js expect.
function readProductFromButton(buttonEl) {
  return {
    productId: buttonEl.dataset.productId,
    slug: buttonEl.dataset.slug,
    name: buttonEl.dataset.name,
    price: parseFloat(buttonEl.dataset.price),
    image: buttonEl.dataset.image,
    category: buttonEl.dataset.category,
    productType: buttonEl.dataset.productType || "PHYSICAL",
  };
}

// One delegated listener handles every cart/wishlist/quantity action
// across every page, since #main-content is replaced on every route
// change and per-render listeners would need re-binding.
function setupProductActions() {
  document.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;

    const action = actionEl.dataset.action;

    if (action === "add-to-cart") {
      handleAddToCart(actionEl);
    } else if (action === "toggle-wishlist") {
      handleToggleWishlist(actionEl);
    } else if (action === "notify-when-in-stock") {
      handleNotifyWhenInStock(actionEl);
    } else if (action === "cart-increase") {
      increaseCartQuantity(actionEl.dataset.lineId);
      rerenderCurrentRoute();
      updateHeaderCounters();
    } else if (action === "cart-decrease") {
      decreaseCartQuantity(actionEl.dataset.lineId);
      rerenderCurrentRoute();
      updateHeaderCounters();
    } else if (action === "cart-remove") {
      removeFromCart(actionEl.dataset.lineId);
      rerenderCurrentRoute();
      updateHeaderCounters();
      showToast("Item removed from cart.");
    } else if (action === "toggle-gift-wrap") {
      handleToggleGiftWrap(actionEl);
    } else if (action === "clear-cart") {
      clearCart();
      rerenderCurrentRoute();
      updateHeaderCounters();
      showToast("Cart cleared.");
    } else if (action === "wishlist-remove") {
      removeFromWishlist(actionEl.dataset.productId);
      rerenderCurrentRoute();
      updateHeaderCounters();
      showToast("Item removed from wishlist.");
    } else if (action === "clear-wishlist") {
      clearWishlist();
      rerenderCurrentRoute();
      updateHeaderCounters();
      showToast("Wishlist cleared.");
    } else if (action === "qty-increase" || action === "qty-decrease") {
      adjustQuantity(actionEl, action === "qty-increase" ? 1 : -1);
    } else if (action === "retry-payfast") {
      handleRetryPayfast(actionEl);
    } else if (action === "admin-logout") {
      handleAdminLogout();
    } else if (action === "admin-logout-all") {
      handleAdminLogoutAllSessions();
    } else if (action === "toggle-mobile-filters") {
      handleToggleMobileFilters(actionEl);
    } else if (action === "toggle-faq") {
      handleToggleFaq(actionEl);
    } else if (action === "toggle-nav-more") {
      handleToggleNavMore(actionEl);
    } else if (action === "toggle-gift-view-more") {
      handleToggleGiftViewMore(actionEl);
    } else if (action === "toggle-view-more") {
      handleToggleViewMore(actionEl);
    } else if (action === "scroll-to-newsletter") {
      handleScrollToNewsletter();
    } else if (action === "request-download") {
      handleRequestDownload(actionEl);
    }
  });
}

// Version 7, Milestone 150: homepage FAQ accordion (see
// components/homeFaqAccordion.js) — toggles this one item's own
// panel/aria-expanded state without touching any other item, so
// multiple can be open at once (a simple, predictable behaviour that
// needs no extra "close others" bookkeeping).
function handleToggleFaq(triggerEl) {
  const panel = document.getElementById(triggerEl.getAttribute("aria-controls"));
  if (!panel) return;

  const isOpen = triggerEl.getAttribute("aria-expanded") === "true";
  triggerEl.setAttribute("aria-expanded", String(!isOpen));
  panel.hidden = isOpen;
}

// Version 7, Milestone 168C: desktop header "More" nav dropdown — same
// generic aria-expanded/hidden toggle idiom as handleToggleFaq above,
// kept as its own small function (rather than reused directly) so its
// name stays clear about what it's for; see setupNavMoreMenu() for the
// outside-click/Escape-close behaviour this alone doesn't cover.
function handleToggleNavMore(triggerEl) {
  const panel = document.getElementById(triggerEl.getAttribute("aria-controls"));
  if (!panel) return;

  const isOpen = triggerEl.getAttribute("aria-expanded") === "true";
  triggerEl.setAttribute("aria-expanded", String(!isOpen));
  panel.hidden = isOpen;
}

// Version 7, Milestone 159: shows/hides the optional gift-message field
// when the "Make it a gift" checkbox is toggled (see
// pages/productDetails.js's renderGiftWrapOption()). Never clears
// whatever the customer already typed when unchecking — the field is
// just hidden, and handleAddToCart() only reads it at all when the
// checkbox is checked, so a hidden, previously-typed message can never
// leak into an unwrapped line.
function handleToggleGiftWrap(checkboxEl) {
  const field = document.getElementById(checkboxEl.getAttribute("aria-controls"));
  if (!field) return;

  checkboxEl.setAttribute("aria-expanded", String(checkboxEl.checked));
  field.hidden = !checkboxEl.checked;
}

// Version 7, Milestone 158: "Thoughtful Gifts" View More/View Less (see
// pages/home.js's renderGiftingSection()). Only ever toggles the plain
// `hidden` attribute on cards already marked data-gift-card-extra="true"
// at render time — never adds/removes cards, never re-fetches, never
// auto-selects anything. Collapsing returns focus/scroll to the section
// heading rather than leaving the customer stranded below a grid that
// just shrank out from under them. No animation is used either way, so
// there's nothing that needs a separate prefers-reduced-motion branch
// for the show/hide itself — only the scroll-into-view on collapse
// checks it, since "smooth" scrolling is real motion.
function handleToggleGiftViewMore(buttonEl) {
  const grid = document.getElementById(buttonEl.getAttribute("aria-controls"));
  if (!grid) return;

  const isExpanded = buttonEl.getAttribute("aria-expanded") === "true";
  const extraCards = grid.querySelectorAll('[data-gift-card-extra="true"]');

  if (isExpanded) {
    extraCards.forEach((card) => {
      card.hidden = true;
    });
    buttonEl.setAttribute("aria-expanded", "false");
    buttonEl.textContent = "View More";

    const heading = document.getElementById("gifting-section-heading");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  } else {
    extraCards.forEach((card) => {
      card.hidden = false;
    });
    buttonEl.setAttribute("aria-expanded", "true");
    buttonEl.textContent = "View Less";
  }
}

// "Notify Me" on a not-yet-available digital product (see
// pages/home.js's Digital Colouring Books section) scrolls to the
// real newsletter form on the same page rather than linking to it —
// an in-page <a href="#..."> would be intercepted by router.js's own
// click handling (every internal link goes through navigateTo(), see
// its own comment on why) and trigger a full route re-render instead
// of a smooth scroll, so this is a plain DOM scroll + focus instead.
function handleScrollToNewsletter() {
  const form = document.querySelector("[data-newsletter-form]");
  if (!form) return;

  form.scrollIntoView({ behavior: "smooth", block: "center" });
  form.querySelector("#newsletter-email")?.focus();
}

// Version 7, Milestone 167: generic "View More"/"View Less" for any
// homepage grid built with components/expandableGrid.js's
// renderExpandableGrid() — currently Digital Colouring Books. A
// separate implementation from Thoughtful Gifts' own
// handleToggleGiftViewMore (untouched, already shipped) — see that
// function's own comment for why this isn't a refactor of it. Reads
// which cards to reveal via the generic data-extra-card="true"
// attribute (not gift-specific), and an optional data-scroll-target on
// the button itself for where to scroll on collapse, rather than a
// hardcoded element id.
function handleToggleViewMore(buttonEl) {
  const grid = document.getElementById(buttonEl.getAttribute("aria-controls"));
  if (!grid) return;

  const isExpanded = buttonEl.getAttribute("aria-expanded") === "true";
  const extraCards = grid.querySelectorAll('[data-extra-card="true"]');

  if (isExpanded) {
    extraCards.forEach((card) => {
      card.hidden = true;
    });
    buttonEl.setAttribute("aria-expanded", "false");
    buttonEl.textContent = "View More";

    const scrollTargetId = buttonEl.dataset.scrollTarget;
    const target = scrollTargetId ? document.getElementById(scrollTargetId) : null;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  } else {
    extraCards.forEach((card) => {
      card.hidden = false;
    });
    buttonEl.setAttribute("aria-expanded", "true");
    buttonEl.textContent = "View Less";
  }
}

// Version 7, Milestone 159: reads the optional gift-wrap checkbox/
// message from the same .product-details container, if present (the
// section only renders at all for a PHYSICAL product — see
// pages/productDetails.js's renderGiftWrapOption()). Returns
// giftWrap:false with no message read at all when the checkbox isn't
// checked, or doesn't exist (shop-grid/homepage quick-add, wishlist —
// none of those have this section), so every non-detail-page Add to
// Cart button keeps adding a plain, unwrapped line exactly as before.
function readGiftOptionsFromProductDetails(buttonEl) {
  const container = buttonEl.closest(".product-details");
  const checkbox = container?.querySelector("#giftWrapCheckbox");
  if (!checkbox?.checked) return { giftWrap: false, giftMessage: null };

  const messageInput = container.querySelector("#giftMessageInput");
  return { giftWrap: true, giftMessage: messageInput?.value.trim() || null };
}

// Add to Cart on the product details page must use the selected
// quantity; everywhere else (product cards, wishlist page) there's no
// quantity selector nearby, so it defaults to 1.
// Version 7, Milestone 171E: a disabled HTML button never dispatches a
// click at all — this `disabled` check is defense in depth, not the
// real gate (every out-of-stock Add to Cart button this milestone adds
// is rendered with the `disabled` attribute in the first place; see
// productCard.js/productDetails.js/wishlistItem.js).
function handleAddToCart(buttonEl) {
  if (buttonEl.disabled) return;

  const quantityInput = buttonEl.closest(".product-details")?.querySelector(".quantity-selector__input");
  const quantity = quantityInput ? Math.max(1, parseInt(quantityInput.value, 10) || 1) : 1;

  const product = readProductFromButton(buttonEl);
  const giftOptions = readGiftOptionsFromProductDetails(buttonEl);
  addToCart(product, quantity, giftOptions);

  updateHeaderCounters();
  showToast(giftOptions.giftWrap ? `${product.name} (gift wrapped) added to cart.` : `${product.name} added to cart.`);
}

// Version 7, Milestone 152: secure digital downloads. One handler
// covers both the logged-in customer path (accountOrderDetail.js) and
// the guest secure-token path (guestDownloadPage.js) — the button's own
// data-guest-token attribute (present only on the guest page) decides
// which API call to make. Every click generates a fresh, short-lived
// signed URL server-side; nothing here caches or reuses one.
async function handleRequestDownload(buttonEl) {
  const orderItemId = buttonEl.dataset.orderItemId;
  const guestToken = buttonEl.dataset.guestToken;
  if (!orderItemId) return;

  const card = buttonEl.closest("[data-digital-downloads-banner-host]");
  const banner = card?.querySelector("[data-digital-download-banner]");
  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  const originalText = buttonEl.textContent;
  buttonEl.disabled = true;
  buttonEl.textContent = "Generating link...";

  try {
    const response = guestToken ? await requestGuestDownload(guestToken, orderItemId) : await requestCustomerDownload(orderItemId);
    const url = response?.data?.url;
    if (url) {
      // Opens in a new tab, same as every other external/download link
      // in this app (marketplace links, tracking URLs) — never
      // navigates the current SPA page away from the order/downloads
      // view the customer is looking at.
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : "We could not generate a download link right now. Please try again shortly.";
    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    } else {
      window.alert(message);
    }
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = originalText;
  }
}

// Toggling wishlist state only needs to update the button that was
// clicked (see patchWishlistButton) — the product card grid it lives in
// doesn't otherwise depend on wishlist state, so a full page re-render
// isn't needed and would just reset scroll/focus for no reason.
function handleToggleWishlist(buttonEl) {
  const product = readProductFromButton(buttonEl);
  const isActive = toggleWishlist(product);

  patchWishlistButton(buttonEl, isActive);
  updateHeaderCounters();
  showToast(isActive ? `${product.name} added to wishlist.` : `${product.name} removed from wishlist.`);

  // Version 7, Milestone 174C: best-effort server sync — the guest,
  // Local-Storage wishlist above is the source of truth either way, so
  // a failure here (401 for a guest, or any network error) is silently
  // ignored rather than shown to the visitor. See wishlist.service.ts's
  // own header comment.
  const syncCall = isActive ? addToServerWishlist(product.productId) : removeFromServerWishlist(product.productId);
  syncCall.catch(() => {});
}

// Version 7, Milestone 174C: back-in-stock — logged-in only (see
// stockAlert.service.ts's own header comment). A 401 here means the
// visitor isn't logged in; shown as a clear, actionable message rather
// than a generic error, since "please log in" is genuinely the fix.
async function handleNotifyWhenInStock(buttonEl) {
  const productId = buttonEl.dataset.productId;
  const banner = document.querySelector("[data-stock-alert-banner]");
  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }
  buttonEl.disabled = true;

  try {
    await subscribeToStockAlert(productId);
    buttonEl.textContent = "We'll Email You";
    if (banner) {
      banner.className = "form-banner form-banner--success";
      banner.textContent = "You're on the list. We'll email you as soon as this is back in stock.";
      banner.hidden = false;
    }
  } catch (error) {
    buttonEl.disabled = false;
    if (banner) {
      banner.className = "form-banner form-banner--error";
      banner.textContent = error instanceof ApiError && error.status === 401 ? "Please log in to get a back-in-stock alert." : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  }
}

// Updates a wishlist button's visual state in place. Product cards use
// an icon-only circular button (product-card__wishlist); the product
// details page uses a full-width heart-icon-plus-label button instead
// (product-details__wishlist-btn, Version 7, Milestone 168C).
function patchWishlistButton(buttonEl, isActive) {
  const name = buttonEl.dataset.name || "product";

  buttonEl.classList.toggle("is-active", isActive);
  buttonEl.setAttribute("aria-pressed", String(isActive));

  if (buttonEl.classList.contains("product-card__wishlist")) {
    buttonEl.innerHTML = isActive ? "&#9829;" : "&#9825;";
    buttonEl.setAttribute("aria-label", isActive ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`);
  } else if (buttonEl.classList.contains("product-details__wishlist-btn")) {
    const icon = isActive ? "&#9829;" : "&#9825;";
    const label = isActive ? "Remove from Wishlist" : "Add to Wishlist";
    buttonEl.innerHTML = `<span aria-hidden="true">${icon}</span> ${label}`;
  } else {
    buttonEl.textContent = isActive ? "Remove from Wishlist" : "Add to Wishlist";
  }
}

// Version 7, Milestone 171E: clamps against the selector's own
// data-max-quantity (product detail page only — see productDetails.js —
// set to the product's real stockQuantity) so the customer can never
// select more than is actually in stock. Absent on any other quantity
// selector (e.g. the cart page's own +/- controls), which keeps this
// unbounded exactly as before — the backend independently re-validates
// requested quantity against live stock at order-creation time either
// way (see order.service.ts's verifyItems()), so this is a UX guard,
// never the actual limit's enforcement point.
function adjustQuantity(buttonEl, delta) {
  const selector = buttonEl.closest(".quantity-selector");
  const input = selector?.querySelector(".quantity-selector__input");
  if (!input) return;

  const maxRaw = selector.dataset.maxQuantity;
  const max = maxRaw ? parseInt(maxRaw, 10) : Infinity;
  const current = parseInt(input.value, 10) || 1;
  input.value = Math.min(max, Math.max(1, current + delta));
}

// Guest checkout form: validate on submit, show field-level errors,
// clear a field's error as soon as the customer edits it, and create a
// demo order on success. Delegated (like everything else here) since
// the form only exists while #main-content is showing the checkout page.
function setupCheckoutForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("#checkout-form");
    if (!form) return;

    event.preventDefault();
    handleCheckoutSubmit(form);
  });

  document.addEventListener("input", (event) => {
    const form = event.target.closest("#checkout-form");
    if (!form || !event.target.name) return;
    clearFieldError(form, event.target.name);
  });

  document.addEventListener("change", (event) => {
    const form = event.target.closest("#checkout-form");
    if (!form || event.target.name !== "paymentMethod") return;
    clearFieldError(form, "paymentMethod");
  });

  document.addEventListener("change", (event) => {
    const form = event.target.closest("#checkout-form");
    if (!form || event.target.name !== "deliveryMethod") return;
    clearFieldError(form, "deliveryMethod");
    updateCheckoutDeliveryMethodUI(form, event.target.value);
  });

  // Version 7, Milestone 174C, brief section 31: captures a checkout-
  // recovery intent once the customer has typed a plausible email and
  // has real items in cart — debounced so this never fires on every
  // keystroke. Deliberately silent either way (success or failure);
  // see checkoutIntent.controller.ts's own comment for why this must
  // never surface an error banner mid-checkout.
  let checkoutIntentTimer = null;
  document.addEventListener("blur", (event) => {
    const form = event.target.closest("#checkout-form");
    if (!form || event.target.name !== "email") return;

    const email = event.target.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    const items = getCart().map((item) => ({ productSlug: item.slug, quantity: item.quantity }));
    if (items.length === 0) return;

    clearTimeout(checkoutIntentTimer);
    checkoutIntentTimer = setTimeout(() => {
      captureCheckoutIntent(email, items).catch(() => {});
    }, 800);
  }, true);
}

// Version 7, Milestone 168C: switching delivery method toggles the
// address vs. collection-city fields (and their `required` attributes,
// so browser-native validation and validateCheckoutForm() agree with
// what's actually visible) and recomputes the displayed delivery fee/
// total/note in place — without a full page re-render, since only
// this one section of the page actually needs to change. Mirrors the
// exact same fee rule config/delivery.js's calculateDeliveryFee() uses
// (kept as a small local copy so this file doesn't need a new import
// for one calculation used in exactly one place).
function updateCheckoutDeliveryMethodUI(form, method) {
  const addressFields = form.querySelector("[data-delivery-address-fields]");
  const collectionFields = form.querySelector("[data-collection-fields]");
  // Version 7, Milestone 168C.1: COURIER_DOOR needs the full address;
  // COURIER_LOCKER (no real locker-picker yet) needs only city/
  // province — see checkoutPage.js's own comment on why a full street
  // address would be misleading for a method that doesn't actually
  // deliver to one.
  const requiresFullAddress = method === "COURIER_DOOR";
  const requiresAreaOnly = method === "COURIER_LOCKER";
  const requiresAddressFields = requiresFullAddress || requiresAreaOnly;

  if (addressFields) {
    addressFields.hidden = !requiresAddressFields;

    ["city", "province"].forEach((name) => {
      const field = addressFields.querySelector(`[name="${name}"]`);
      if (field) field.required = requiresAddressFields;
      if (!requiresAddressFields) clearFieldError(form, name);
    });

    const fullOnlyWrapper = addressFields.querySelector("[data-address-full-only]");
    if (fullOnlyWrapper) fullOnlyWrapper.hidden = !requiresFullAddress;
    ["street", "suburb", "postalCode"].forEach((name) => {
      const field = addressFields.querySelector(`[name="${name}"]`);
      if (field) field.required = requiresFullAddress;
      if (!requiresFullAddress) clearFieldError(form, name);
    });

    const lockerNote = addressFields.querySelector("[data-locker-area-note]");
    if (lockerNote) lockerNote.hidden = !requiresAreaOnly;
  }

  if (collectionFields) {
    collectionFields.hidden = method !== "COLLECTION";
    const cityField = collectionFields.querySelector("[name=collectionCity]");
    if (cityField) cityField.required = method === "COLLECTION";
    if (method !== "COLLECTION") clearFieldError(form, "collectionCity");
  }

  const physicalSubtotal = parseFloat(form.dataset.physicalSubtotal || "0");
  const hasPhysicalItems = form.dataset.hasPhysicalItems === "true";
  const subtotal = parseFloat(form.dataset.subtotal || "0");
  const giftWrapTotal = parseFloat(form.dataset.giftWrapTotal || "0");
  // Version 7, Milestone 172B.4: the checkout page's own referral
  // discount PREVIEW (see checkoutPage.js's getReferralDiscountPreview())
  // — never recomputed here on a delivery-method change, since the
  // discount is based on the qualifying product subtotal, which a
  // delivery method choice never affects.
  const discountTotal = parseFloat(form.dataset.discountTotal || "0");
  // Version 7, Milestone 180, Part A: read straight off the form's own
  // data attribute (set once at render time from the actual logged-in-
  // customer lookup — see checkoutPage.js), never re-guessed here.
  const isRegisteredCustomer = form.dataset.isRegisteredCustomer === "true";

  const feeForMethod = (candidateMethod) => {
    if (!hasPhysicalItems) return 0;
    if (candidateMethod !== "COURIER_LOCKER" && candidateMethod !== "COURIER_DOOR") return 0;
    const threshold = isRegisteredCustomer ? REGISTERED_FREE_DELIVERY_THRESHOLD : FREE_DELIVERY_THRESHOLD;
    const qualifiesForFree = physicalSubtotal >= threshold;
    if (qualifiesForFree) return 0;
    return candidateMethod === "COURIER_LOCKER" ? COURIER_LOCKER_FEE : COURIER_DOOR_FEE;
  };

  const deliveryFee = feeForMethod(method);

  form.querySelectorAll("[data-delivery-method-fee]").forEach((el) => {
    const fee = feeForMethod(el.dataset.deliveryMethodFee);
    el.textContent = fee === 0 ? "FREE" : `R${fee.toFixed(2)}`;
  });

  const summary = document.querySelector(".order-summary");
  if (!summary) return;

  const labelEl = summary.querySelector("[data-order-summary-delivery-label]");
  if (labelEl) labelEl.textContent = hasPhysicalItems ? getDeliveryMethodLabel(method) : "Delivery";

  const valueEl = summary.querySelector("[data-order-summary-delivery-value]");
  if (valueEl) valueEl.textContent = deliveryFee === 0 ? "FREE" : `R${deliveryFee.toFixed(2)}`;
  // Version 7, Milestone 171E: a real delivery method has now been
  // picked — the row's own "no selection yet" styling (italic/muted,
  // see components.css) no longer applies. Selecting a radio is a
  // one-way transition (there's no UI affordance to un-check every
  // option back to none — see checkoutPage.js's own comment), so this
  // only ever needs to remove the class, never re-add it.
  valueEl?.closest(".order-summary__row")?.classList.remove("order-summary__row--delivery-pending");

  const totalEl = summary.querySelector("[data-order-summary-total-value]");
  if (totalEl) totalEl.textContent = `R${(subtotal + giftWrapTotal + deliveryFee - discountTotal).toFixed(2)}`;

  const noteEl = summary.querySelector("[data-order-summary-delivery-note]");
  if (noteEl) noteEl.textContent = getDeliveryNote(deliveryFee, hasPhysicalItems, { isRegisteredCustomer }).trim();
}

function clearFieldError(form, fieldName) {
  const errorEl = form.querySelector(`[data-error-for="${fieldName}"]`);
  if (errorEl) errorEl.textContent = "";

  const groupEl = form.querySelector(`[data-field-group="${fieldName}"]`);
  if (groupEl) {
    groupEl.classList.remove("has-error");
    return;
  }

  const inputEl = form.querySelector(`[name="${fieldName}"]`);
  if (inputEl) {
    inputEl.classList.remove("has-error");
    inputEl.removeAttribute("aria-invalid");
  }
}

function clearAllCheckoutErrors(form) {
  form.querySelectorAll(".form-field__error").forEach((el) => (el.textContent = ""));
  form.querySelectorAll(".has-error").forEach((el) => el.classList.remove("has-error"));
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
  clearCheckoutFormBanner(form);
}

function showCheckoutErrors(form, errors) {
  Object.entries(errors).forEach(([field, message]) => {
    const errorEl = form.querySelector(`[data-error-for="${field}"]`);
    if (errorEl) errorEl.textContent = message;

    const groupEl = form.querySelector(`[data-field-group="${field}"]`);
    if (groupEl) {
      groupEl.classList.add("has-error");
      return;
    }

    const inputEl = form.querySelector(`[name="${field}"]`);
    if (inputEl) {
      inputEl.classList.add("has-error");
      inputEl.setAttribute("aria-invalid", "true");
    }
  });
}

function focusFirstCheckoutError(form) {
  const firstErrorEl = form.querySelector(".form-field__input.has-error, .payment-methods.has-error, .delivery-methods.has-error");
  if (!firstErrorEl) return;

  const focusTarget = firstErrorEl.matches(".payment-methods, .delivery-methods")
    ? firstErrorEl.querySelector("input[type=radio]")
    : firstErrorEl;

  focusTarget?.focus();
  firstErrorEl.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showCheckoutFormBanner(form, message) {
  const bannerEl = form.querySelector("[data-checkout-banner]");
  if (!bannerEl) return;

  bannerEl.textContent = message;
  bannerEl.hidden = false;
  bannerEl.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearCheckoutFormBanner(form) {
  const bannerEl = form.querySelector("[data-checkout-banner]");
  if (!bannerEl) return;

  bannerEl.textContent = "";
  bannerEl.hidden = true;
}

// Maps the backend's dotted/indexed field names (customer.email,
// deliveryAddress.postalCode, ...) onto this form's actual input
// `name` attributes, so a backend validation error can highlight the
// same field a matching client-side error would have.
const BACKEND_TO_CHECKOUT_FIELD = {
  "customer.firstName": "firstName",
  "customer.lastName": "lastName",
  "customer.email": "email",
  "customer.phone": "phone",
  deliveryMethod: "deliveryMethod",
  collectionCity: "collectionCity",
  "deliveryAddress.streetAddress": "street",
  "deliveryAddress.suburb": "suburb",
  "deliveryAddress.city": "city",
  "deliveryAddress.province": "province",
  "deliveryAddress.postalCode": "postalCode",
  paymentMethod: "paymentMethod",
};

// Backend errors come back as [{ field, message }]; showCheckoutErrors
// (shared with the client-side validator above) expects a
// { fieldName: message } map — any error for a field this form doesn't
// have (e.g. an `items[...]` stock problem) has nowhere to attach, so
// it's collected into the form-level banner instead.
function mapBackendErrorsToCheckoutForm(form, backendErrors) {
  const fieldErrors = {};
  const unmatched = [];

  backendErrors.forEach(({ field, message }) => {
    const formField = BACKEND_TO_CHECKOUT_FIELD[field];
    if (formField) {
      fieldErrors[formField] = message;
    } else {
      unmatched.push(message);
    }
  });

  if (Object.keys(fieldErrors).length > 0) {
    showCheckoutErrors(form, fieldErrors);
    focusFirstCheckoutError(form);
  }

  if (unmatched.length > 0) {
    showCheckoutFormBanner(form, unmatched.join(" "));
  }
}

async function handleCheckoutSubmit(form) {
  clearAllCheckoutErrors(form);

  const data = Object.fromEntries(new FormData(form).entries());
  const { isValid, errors } = validateCheckoutForm(data);

  if (!isValid) {
    showCheckoutErrors(form, errors);
    focusFirstCheckoutError(form);
    return;
  }

  const items = getCart();
  // Version 7, Milestone 168C.1: COURIER_DOOR sends the full address;
  // COURIER_LOCKER sends only city/province (no real locker-picker
  // exists yet — see checkoutPage.js's own comment); COLLECTION sends
  // neither.
  const requiresFullAddress = data.deliveryMethod === "COURIER_DOOR";
  const requiresAreaOnly = data.deliveryMethod === "COURIER_LOCKER";
  const payload = buildOrderPayload({
    customer: {
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: data.email.trim(),
      phone: data.phone.trim(),
    },
    deliveryMethod: data.deliveryMethod,
    deliveryAddress: requiresFullAddress
      ? {
          street: data.street.trim(),
          suburb: data.suburb.trim(),
          city: data.city.trim(),
          province: data.province,
          postalCode: data.postalCode.trim(),
        }
      : requiresAreaOnly
        ? {
            city: data.city.trim(),
            province: data.province,
          }
        : undefined,
    collectionCity: data.deliveryMethod === "COLLECTION" ? data.collectionCity : undefined,
    deliveryNotes: (data.deliveryNotes || "").trim(),
    paymentMethod: data.paymentMethod,
    items,
  });

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    const response = await createOrder(payload);
    const orderNumber = response.data.orderNumber;

    clearCart();
    updateHeaderCounters();

    if (data.paymentMethod === "payfast") {
      // Version 7, Milestone 172B.4: deliberately NOT cleared here — a
      // PayFast order is only PENDING at this point, not yet a
      // genuinely successful/confirmed order (payment could still fail
      // or be cancelled on PayFast's own page). Flagged as pending
      // instead, so pages/paymentSuccess.js can clear it once (and
      // only once) this exact order is confirmed PAID.
      markReferralAttributionPendingOrder(orderNumber);
      await redirectToPayfast(orderNumber);
      return;
    }

    // Version 7, Milestone 172B.4: Bank Transfer / Cash on Delivery have
    // no separate payment-confirmation step in this business model —
    // order creation IS the final, accepted state (matches this exact
    // moment already being when the cart itself clears, two lines up).
    clearReferralAttribution();

    navigateTo(`/order-confirmation?order=${encodeURIComponent(orderNumber)}`);
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      showCheckoutFormBanner(form, "We could not connect to the order system right now. Please try again shortly.");
    } else if (error instanceof ApiError && error.errors?.length) {
      mapBackendErrorsToCheckoutForm(form, error.errors);
    } else if (error instanceof ApiError) {
      showCheckoutFormBanner(form, error.message);
    } else {
      showCheckoutFormBanner(form, "Something went wrong placing your order. Please try again.");
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// The order already exists (created above) by the time this runs —
// only the backend ever builds PayFast's fields/signature
// (POST /api/payments/payfast/initiate); this just submits exactly
// what it returns (see js/payfastRetry.js). If initiation itself fails
// (e.g. the backend's own PAYFAST_ENABLED was turned off after this
// page loaded), the order still exists, so the customer is sent to its
// real order confirmation rather than left on a dead end.
async function redirectToPayfast(orderNumber) {
  try {
    await retryPayfastPayment(orderNumber, "checkout");
  } catch {
    navigateTo(`/order-confirmation?order=${encodeURIComponent(orderNumber)}`);
  }
}

// "Try PayFast Again" on payment-success/cancelled/failed (Version 4,
// Milestone 31). Unlike checkout's first-attempt redirectToPayfast
// above, a retry failure shouldn't silently redirect anywhere — the
// customer is already looking at a status page, so the clearest thing
// is an inline error right next to the button they just clicked (see
// components/payfastRetry.js's error span), never marking anything as
// failed/cancelled itself — only the backend's notify route can ever
// do that.
async function handleRetryPayfast(buttonEl) {
  const orderNumber = buttonEl.dataset.orderNumber;
  if (!orderNumber) return;

  const errorEl = buttonEl.parentElement?.querySelector("[data-retry-error]");
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = "";
  }

  const originalText = buttonEl.textContent;
  buttonEl.disabled = true;
  buttonEl.textContent = "Redirecting to PayFast…";

  try {
    await retryPayfastPayment(orderNumber, "retry");
    // On success the browser navigates away to PayFast — nothing left
    // to update here.
  } catch (error) {
    buttonEl.disabled = false;
    buttonEl.textContent = originalText;
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent =
        error instanceof ApiError
          ? error.message
          : "We couldn't start PayFast again right now. Please contact Seasonedz Group.";
    }
  }
}

// Order tracking form: submitting a non-empty order number navigates
// to "#/track-order?order=..." — the page itself (a pure function of
// the URL, like search) does the actual lookup and rendering. An empty
// submission never navigates; it shows an inline error instead, the
// same pattern the checkout form uses.
function setupTrackOrderForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("#track-order-form");
    if (!form) return;

    event.preventDefault();

    const input = form.querySelector("#orderNumber");
    const value = (input?.value || "").trim();
    const errorEl = form.querySelector('[data-error-for="orderNumber"]');

    if (!value) {
      if (errorEl) errorEl.textContent = "Please enter an order number.";
      input?.classList.add("has-error");
      input?.focus();
      return;
    }

    navigateTo(`/track-order?order=${encodeURIComponent(value)}`);
  });

  document.addEventListener("input", (event) => {
    const form = event.target.closest("#track-order-form");
    if (!form || event.target.id !== "orderNumber") return;

    const errorEl = form.querySelector('[data-error-for="orderNumber"]');
    if (errorEl) errorEl.textContent = "";
    event.target.classList.remove("has-error");
  });
}

// Version 7, Milestone 150: homepage newsletter form (see
// components/newsletterSignup.js).
// Version 7, Milestone 168F: connected to a real subscriber endpoint
// (js/api/newsletterApi.js) — client-side validation still runs first
// (same rules as before), then the real backend call decides success.
// The submit button is disabled for the whole round trip so a
// customer can't fire off repeated submissions while one is already
// in flight, and stays disabled after a genuine success so the same
// successful submission can't be repeated; on any error it's
// re-enabled so they can correct something and try again.
function setupNewsletterForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-newsletter-form]");
    if (!form) return;

    event.preventDefault();
    handleNewsletterSubmit(form);
  });
}

async function handleNewsletterSubmit(form) {
  const nameInput = form.querySelector("#newsletter-name");
  const emailInput = form.querySelector("#newsletter-email");
  const websiteInput = form.querySelector("#newsletter-website");
  const messageEl = form.querySelector("[data-newsletter-message]");
  const submitButton = form.querySelector('button[type="submit"]');

  const name = (nameInput?.value || "").trim();
  const email = (emailInput?.value || "").trim();
  const website = (websiteInput?.value || "").trim();

  function showMessage(text, variant) {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.classList.toggle("newsletter-form__message--success", variant === "success");
    messageEl.classList.toggle("newsletter-form__message--error", variant === "error");
    messageEl.hidden = false;
  }

  if (!name || !email || !isValidEmail(email)) {
    showMessage(!name ? "Please enter your name." : "Please enter a valid email address.", "error");
    (!name ? nameInput : emailInput)?.focus();
    return;
  }

  const originalButtonText = submitButton?.textContent;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Sending...";
  }

  try {
    const response = await subscribeToNewsletter({ name, email, website });
    showMessage(
      response?.message ||
        "Thank you. You're now signed up for Seasonedz Group updates and free printable colouring pages.",
      "success"
    );
    form.reset();
    // Left disabled deliberately — a successful subscription shouldn't
    // be resubmittable from the same form state. The button text must
    // still be updated off "Sending..." though, or it looks stuck
    // processing forever even though the request already finished.
    if (submitButton) {
      submitButton.textContent = "Subscribed";
    }
  } catch (error) {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }

    if (error instanceof ApiUnavailableError) {
      showMessage("We could not sign you up right now. Please try again shortly.", "error");
    } else if (error instanceof ApiError && error.errors?.length) {
      showMessage(error.errors[0].message, "error");
    } else if (error instanceof ApiError) {
      showMessage(error.message, "error");
    } else {
      showMessage("We could not sign you up right now. Please try again shortly.", "error");
    }
  }
}

// Admin login form (Version 7, Milestone 58 — foundation only).
//
// Milestone 179: now a two-step flow — email/password, then an email
// OTP code (see adminLogin.js's own header comment for why both steps
// live in this one page's markup). adminLogin() only ever returns a
// challengeToken; the backend has NOT created a session yet at that
// point (brief: "do NOT create the authenticated admin session before
// OTP succeeds"). Only adminVerifyOtp() succeeding actually sets the
// session cookie — that's the only point this navigates to /admin.
function setupAdminLoginForm() {
  document.addEventListener("submit", (event) => {
    const passwordForm = event.target.closest("#admin-login-form");
    if (passwordForm) {
      event.preventDefault();
      handleAdminLoginSubmit(passwordForm);
      return;
    }

    const otpForm = event.target.closest("#admin-otp-form");
    if (otpForm) {
      event.preventDefault();
      handleAdminOtpSubmit(otpForm);
    }
  });

  document.addEventListener("click", (event) => {
    const resendButton = event.target.closest('[data-action="admin-otp-resend"]');
    if (resendButton) {
      handleAdminOtpResend(resendButton);
      return;
    }

    const backButton = event.target.closest('[data-action="admin-otp-back"]');
    if (backButton) {
      handleAdminOtpBack(backButton);
    }
  });
}

async function handleAdminLoginSubmit(form) {
  const email = form.querySelector("#adminEmail")?.value.trim() || "";
  const password = form.querySelector("#adminPassword")?.value || "";
  const banner = form.querySelector("[data-admin-login-banner]");
  const submitButton = form.querySelector('button[type="submit"]');

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  if (!email || !password) {
    if (banner) {
      banner.textContent = "Please enter your email and password.";
      banner.hidden = false;
    }
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    const response = await adminLogin(email, password);
    showAdminOtpStep(form, response.data.challengeToken, response.data.maskedEmail);
  } catch (error) {
    // Deliberately the same generic message regardless of the real
    // cause (wrong email, wrong password, rate limited) — never hints
    // at which part of the input was wrong. See
    // VERSION_7_ADMIN_AUTH_FOUNDATION_RESULT.md.
    const message =
      error instanceof ApiUnavailableError
        ? "We could not connect to the admin system right now. Please try again shortly."
        : "Invalid email or password.";

    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// `.checkout-form` sets `display: flex` (see css/pages.css), which
// beats the browser's default `[hidden] { display: none }` at equal
// specificity — form.hidden alone would leave a form visually in
// place, same note as handleCustomerForgotPasswordSubmit elsewhere in
// this file. Every hide/show of admin-login-form/admin-otp-form below
// sets the inline style alongside .hidden for exactly this reason.
function showAdminOtpStep(passwordForm, challengeToken, maskedEmail) {
  const otpForm = document.getElementById("admin-otp-form");
  if (!otpForm) return;

  passwordForm.hidden = true;
  passwordForm.style.display = "none";

  otpForm.dataset.challengeToken = challengeToken;
  otpForm.hidden = false;
  otpForm.style.display = "";

  const description = otpForm.querySelector("[data-admin-otp-description]");
  if (description) description.textContent = `Enter the 6-digit code sent to ${maskedEmail}.`;

  const codeInput = otpForm.querySelector("#adminOtpCode");
  if (codeInput) {
    codeInput.value = "";
    codeInput.focus();
  }

  const resendButton = otpForm.querySelector('[data-action="admin-otp-resend"]');
  if (resendButton) startAdminOtpResendCooldown(resendButton);
}

async function handleAdminOtpSubmit(form) {
  const code = form.querySelector("#adminOtpCode")?.value.trim() || "";
  const challengeToken = form.dataset.challengeToken || "";
  const banner = form.querySelector("[data-admin-otp-banner]");
  const submitButton = form.querySelector('button[type="submit"]');

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  if (!/^\d{6}$/.test(code)) {
    if (banner) {
      banner.textContent = "Enter the 6-digit code from your email.";
      banner.hidden = false;
    }
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    await adminVerifyOtp(challengeToken, code);
    navigateTo("/admin");
  } catch (error) {
    // Unlike the password step above, the OTP step's own errors
    // (wrong code, too many attempts, expired) never leak whether an
    // email exists — that risk is already behind the password step
    // that got the visitor here — so the backend's specific message is
    // shown directly rather than flattened to one generic string.
    const message =
      error instanceof ApiUnavailableError
        ? "We could not connect to the admin system right now. Please try again shortly."
        : error instanceof ApiError
          ? error.message
          : "Something went wrong. Please try again.";

    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// Cosmetic only — the server is the real enforcement of the 60 second
// cooldown (adminOtp.service.ts's secondsUntilOtpResendAllowed); this
// just keeps the button disabled for the same duration so a visitor
// isn't tempted to click it before the server would accept it anyway.
function startAdminOtpResendCooldown(button) {
  const cooldownSeconds = 60;
  const originalLabel = "Resend Code";
  let remaining = cooldownSeconds;

  button.disabled = true;
  button.textContent = `Resend Code (${remaining}s)`;

  const interval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(interval);
      button.textContent = originalLabel;
      button.disabled = false;
      return;
    }
    button.textContent = `Resend Code (${remaining}s)`;
  }, 1000);
}

async function handleAdminOtpResend(button) {
  const form = button.closest("#admin-otp-form");
  if (!form) return;

  const challengeToken = form.dataset.challengeToken || "";
  const banner = form.querySelector("[data-admin-otp-banner]");

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }
  button.disabled = true;

  try {
    const response = await adminResendOtp(challengeToken);
    form.dataset.challengeToken = response.data.challengeToken;

    const description = form.querySelector("[data-admin-otp-description]");
    if (description) description.textContent = `Enter the 6-digit code sent to ${response.data.maskedEmail}.`;

    startAdminOtpResendCooldown(button);
  } catch (error) {
    // A 429 (still within the server's own cooldown) leaves the button
    // disabled — clicking again immediately would just fail the same
    // way. Any other error re-enables it so a genuine retry is possible.
    const isRateLimited = error instanceof ApiError && error.status === 429;
    if (!isRateLimited) button.disabled = false;

    const message =
      error instanceof ApiUnavailableError
        ? "We could not connect to the admin system right now. Please try again shortly."
        : error instanceof ApiError
          ? error.message
          : "Something went wrong. Please try again.";

    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  }
}

function handleAdminOtpBack(button) {
  const otpForm = button.closest("#admin-otp-form");
  const passwordForm = document.getElementById("admin-login-form");
  if (!otpForm || !passwordForm) return;

  otpForm.hidden = true;
  otpForm.style.display = "none";
  otpForm.dataset.challengeToken = "";

  const codeInput = otpForm.querySelector("#adminOtpCode");
  if (codeInput) codeInput.value = "";
  const otpBanner = otpForm.querySelector("[data-admin-otp-banner]");
  if (otpBanner) {
    otpBanner.hidden = true;
    otpBanner.textContent = "";
  }

  passwordForm.hidden = false;
  passwordForm.style.display = "";

  const passwordInput = passwordForm.querySelector("#adminPassword");
  if (passwordInput) passwordInput.value = "";
}

// Admin sign out (Version 7, Milestone 58). Clears the session
// server-side and locally, then returns to the login page regardless
// of whether the API call succeeded — there is nothing useful to show
// the visitor if logout itself fails, and staying on a page that
// requires auth would just immediately redirect back to login anyway.
async function handleAdminLogout() {
  try {
    await adminLogout();
  } catch {
    // Ignored deliberately — see comment above.
  }
  navigateTo("/admin/login");
}

// Milestone 179, brief section 32: "Log Out All Sessions" self-service
// action — sensitive (signs this admin out of every device, not just
// this browser), so it asks for confirmation first, same discipline as
// every other sensitive admin action in this codebase (window.confirm).
async function handleAdminLogoutAllSessions() {
  const confirmed = window.confirm("Sign out of all sessions?\nThis signs you out on every device, not just this one.");
  if (!confirmed) return;

  try {
    await adminLogoutAllSessions();
  } catch {
    // Ignored deliberately — same reasoning as handleAdminLogout above.
  }
  navigateTo("/admin/login");
}

// Milestone 179: shared form-error/banner helpers scoped to admin
// forms only — deliberately NOT a shared function with
// clearAccountFormErrors/showAccountFormErrors/showAccountFormBanner
// below (those hardcode a selector list of customer-only banner
// attribute names), so admin forms can never accidentally depend on or
// be affected by a change made for customer forms, or vice versa.
function clearAdminFormErrors(form) {
  form.querySelectorAll(".form-field__error").forEach((el) => (el.textContent = ""));
  form.querySelectorAll(".has-error").forEach((el) => el.classList.remove("has-error"));
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));

  const bannerEl = form.querySelector(
    "[data-admin-forgot-password-banner], [data-admin-reset-password-banner], [data-admin-activate-account-banner], [data-admin-user-invite-banner]"
  );
  if (bannerEl) {
    bannerEl.textContent = "";
    bannerEl.hidden = true;
  }
}

function showAdminFormErrors(form, errors) {
  Object.entries(errors).forEach(([field, message]) => {
    const errorEl = form.querySelector(`[data-error-for="${field}"]`);
    if (errorEl) errorEl.textContent = message;

    const inputEl = form.querySelector(`[name="${field}"]`);
    if (inputEl) {
      inputEl.classList.add("has-error");
      inputEl.setAttribute("aria-invalid", "true");
    }
  });
}

function showAdminFormBanner(form, message) {
  const bannerEl = form.querySelector(
    "[data-admin-forgot-password-banner], [data-admin-reset-password-banner], [data-admin-activate-account-banner], [data-admin-user-invite-banner]"
  );
  if (bannerEl) {
    bannerEl.textContent = message;
    bannerEl.hidden = false;
  }
}

// Milestone 179, Part D: admin forgot password — /admin/forgot-password.
// Same shape as handleCustomerForgotPasswordSubmit below, on the
// separate admin-only endpoint (never the customer one).
function setupAdminForgotPasswordForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("#admin-forgot-password-form");
    if (!form) return;

    event.preventDefault();
    handleAdminForgotPasswordSubmit(form);
  });
}

async function handleAdminForgotPasswordSubmit(form) {
  clearAdminFormErrors(form);

  const email = form.querySelector("#adminForgotPasswordEmail")?.value.trim() || "";
  const { isValid, errors } = validateForgotPasswordForm({ email });
  if (!isValid) {
    showAdminFormErrors(form, errors);
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    await adminForgotPassword(email);
    form.hidden = true;
    form.style.display = "none";
    const successEl = form.closest(".account-page")?.querySelector("[data-admin-forgot-password-success]");
    if (successEl) successEl.hidden = false;
  } catch (error) {
    showAdminFormBanner(form, unavailableOrGenericMessage(error, "We could not process your request right now. Please try again."));
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// Milestone 179, Part D: admin reset password — /admin/reset-password.
// The reset token never touches localStorage/sessionStorage — read
// straight off the form's data-reset-token attribute, same discipline
// as handleCustomerResetPasswordSubmit below.
function setupAdminResetPasswordForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("#admin-reset-password-form");
    if (!form) return;

    event.preventDefault();
    handleAdminResetPasswordSubmit(form);
  });
}

async function handleAdminResetPasswordSubmit(form) {
  clearAdminFormErrors(form);

  const data = {
    password: form.querySelector("#adminResetPasswordNew")?.value || "",
    confirmPassword: form.querySelector("#adminResetPasswordConfirm")?.value || "",
  };
  const { isValid, errors } = validateAdminSetPasswordForm(data);
  if (!isValid) {
    showAdminFormErrors(form, errors);
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    const token = form.dataset.resetToken || "";
    await adminResetPassword(token, data.password, data.confirmPassword);
    form.hidden = true;
    form.style.display = "none";
    const successEl = form.closest(".account-page")?.querySelector("[data-admin-reset-password-success]");
    if (successEl) successEl.hidden = false;
  } catch (error) {
    showAdminFormBanner(form, unavailableOrGenericMessage(error, "This reset link is invalid or has expired."));
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// Milestone 179, Part B: admin invitation activation — /admin/activate.
// The activation token never touches localStorage/sessionStorage,
// same discipline as the reset-password token above.
function setupAdminActivateAccountForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("#admin-activate-account-form");
    if (!form) return;

    event.preventDefault();
    handleAdminActivateAccountSubmit(form);
  });
}

async function handleAdminActivateAccountSubmit(form) {
  clearAdminFormErrors(form);

  const data = {
    password: form.querySelector("#adminActivatePassword")?.value || "",
    confirmPassword: form.querySelector("#adminActivateConfirm")?.value || "",
  };
  const { isValid, errors } = validateAdminSetPasswordForm(data);
  if (!isValid) {
    showAdminFormErrors(form, errors);
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    const token = form.dataset.activationToken || "";
    await activateAdminInvitation(token, data.password, data.confirmPassword);
    form.hidden = true;
    form.style.display = "none";
    const successEl = form.closest(".account-page")?.querySelector("[data-admin-activate-account-success]");
    if (successEl) successEl.hidden = false;
  } catch (error) {
    showAdminFormBanner(form, unavailableOrGenericMessage(error, "This invitation link is invalid or has expired."));
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// Milestone 179, Part B/G: invite a new admin user — /admin/users/invite.
// ADMIN-only server-side (requireAdminRole); a STAFF session reaching
// this form gets the backend's own 403 message shown in the banner.
function setupAdminUserInviteForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-user-invite-form]");
    if (!form) return;

    event.preventDefault();
    handleAdminUserInviteSubmit(form);
  });
}

async function handleAdminUserInviteSubmit(form) {
  clearAdminFormErrors(form);

  const name = form.querySelector("#adminInviteName")?.value.trim() || "";
  const email = form.querySelector("#adminInviteEmail")?.value.trim() || "";
  const role = form.querySelector("#adminInviteRole")?.value || "STAFF";

  const errors = {};
  if (!name) errors.name = "Full name is required.";
  if (!email) {
    errors.email = "Email is required.";
  } else if (!isValidEmail(email)) {
    errors.email = "Please enter a valid email address.";
  }
  if (Object.keys(errors).length > 0) {
    showAdminFormErrors(form, errors);
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    await inviteAdminUser(name, email, role);
    setPendingAdminMessage(`Invitation sent to ${email}.`);
    navigateTo("/admin/users");
  } catch (error) {
    showAdminFormBanner(form, unavailableOrGenericMessage(error, error instanceof ApiError ? error.message : "Something went wrong. Please try again."));
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// Milestone 179, Part G: admin-users list actions (resend invitation,
// activate/deactivate, change role) — same delegated-click,
// disable-row-then-rerender shape as
// setupAdminReferralAffiliateActions elsewhere in this file.
// Deactivating and changing role are both treated as sensitive (brief
// section 32/39: confirmation required) — resending an invitation or
// reactivating an already-inactive account is not destructive enough
// to need one.
function setupAdminUserActions() {
  document.addEventListener("click", (event) => {
    const resendButton = event.target.closest('[data-action="resend-admin-invitation"]');
    if (resendButton) {
      handleAdminUserAction(resendButton, () => reissueAdminInvitation(resendButton.dataset.adminId), "Invitation resent.");
      return;
    }

    const activateButton = event.target.closest('[data-action="activate-admin-user"]');
    if (activateButton) {
      handleAdminUserAction(activateButton, () => setAdminUserActive(activateButton.dataset.adminId, true), "Account activated.");
      return;
    }

    const deactivateButton = event.target.closest('[data-action="deactivate-admin-user"]');
    if (deactivateButton) {
      const confirmed = window.confirm("Deactivate this admin account?\nThis immediately blocks their login and signs them out of every device.");
      if (!confirmed) return;
      handleAdminUserAction(deactivateButton, () => setAdminUserActive(deactivateButton.dataset.adminId, false), "Account deactivated.");
      return;
    }

    const roleButton = event.target.closest('[data-action="change-admin-user-role"]');
    if (roleButton) {
      const newRole = roleButton.dataset.newRole;
      const confirmed = window.confirm(`Change this account's role to ${newRole}?`);
      if (!confirmed) return;
      handleAdminUserAction(roleButton, () => changeAdminUserRole(roleButton.dataset.adminId, newRole), `Role changed to ${newRole}.`);
    }
  });
}

async function handleAdminUserAction(button, apiCall, successMessage) {
  const row = button.closest("[data-admin-user-row]");
  const banner = document.querySelector("[data-admin-users-banner]");
  const rowButtons = row?.querySelectorAll("button") || [];

  rowButtons.forEach((btn) => (btn.disabled = true));
  if (banner) banner.hidden = true;

  try {
    await apiCall();
    setPendingAdminMessage(successMessage);
    rerenderCurrentRoute();
  } catch (error) {
    rowButtons.forEach((btn) => (btn.disabled = false));
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  }
}

// Customer account forms (Version 7, Milestone 128) — /account's
// login/register toggle, form submission, and logout. Deliberately no
// order history wiring here yet — see accountPage.js's own comment.
// The customer_session cookie is HttpOnly and set entirely by the
// backend; nothing here ever reads, stores, or logs a password or
// session token.
function clearAccountFormErrors(form) {
  form.querySelectorAll(".form-field__error").forEach((el) => (el.textContent = ""));
  form.querySelectorAll(".has-error").forEach((el) => el.classList.remove("has-error"));
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));

  const bannerEl = form.querySelector(
    "[data-customer-login-banner], [data-customer-register-banner], [data-customer-forgot-password-banner], [data-customer-reset-password-banner]"
  );
  if (bannerEl) {
    bannerEl.textContent = "";
    bannerEl.hidden = true;
  }
}

function showAccountFormErrors(form, errors) {
  Object.entries(errors).forEach(([field, message]) => {
    const errorEl = form.querySelector(`[data-error-for="${field}"]`);
    if (errorEl) errorEl.textContent = message;

    const inputEl = form.querySelector(`[name="${field}"]`);
    if (inputEl) {
      inputEl.classList.add("has-error");
      inputEl.setAttribute("aria-invalid", "true");
    }
  });
}

function showAccountFormBanner(form, message) {
  const bannerEl = form.querySelector(
    "[data-customer-login-banner], [data-customer-register-banner], [data-customer-forgot-password-banner], [data-customer-reset-password-banner]"
  );
  if (bannerEl) {
    bannerEl.textContent = message;
    bannerEl.hidden = false;
  }
}

function unavailableOrGenericMessage(error, genericMessage) {
  return error instanceof ApiUnavailableError ? "We could not connect right now. Please try again." : genericMessage;
}

function setupCustomerAccountForms() {
  document.addEventListener("click", (event) => {
    const tabButton = event.target.closest("[data-account-tab]");
    if (tabButton) {
      const targetTab = tabButton.dataset.accountTab;
      const container = tabButton.closest(".account-page");
      if (!container) return;

      container.querySelectorAll("[data-account-tab]").forEach((btn) => {
        const isActive = btn.dataset.accountTab === targetTab;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-selected", String(isActive));
      });
      container.querySelectorAll("[data-account-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.accountPanel !== targetTab;
      });
      return;
    }

    if (event.target.closest("#customer-logout-button")) {
      handleCustomerLogout();
      return;
    }

    // Version 7, Milestone 171F: Account Settings -> Connected Accounts
    // -> Disconnect. "Connect" buttons need no handler here at all —
    // they're plain links to the backend's OAuth start route (a real
    // page navigation), see socialAuthButtons.js/accountPage.js.
    const disconnectButton = event.target.closest('[data-action="disconnect-provider"]');
    if (disconnectButton) {
      handleDisconnectProvider(disconnectButton);
      return;
    }

    // Version 7, Milestone 172B.6: affiliate portal — Copy referral
    // link / Apply.
    const copyLinkButton = event.target.closest('[data-action="copy-referral-link"]');
    if (copyLinkButton) {
      handleCopyReferralLink(copyLinkButton);
      return;
    }

    const applyAffiliateButton = event.target.closest('[data-action="apply-for-affiliate"]');
    if (applyAffiliateButton) {
      handleApplyForAffiliate(applyAffiliateButton);
      return;
    }

    // Version 7, Milestone 171F: purely cosmetic immediate feedback —
    // the actual navigation to the provider's own login page is already
    // underway by the time this runs (a plain <a href>, see
    // socialAuthButtons.js's own header comment on why this can never
    // be "double submitted" the way a form can).
    const socialAuthButton = event.target.closest("[data-social-auth-button]");
    if (socialAuthButton) {
      socialAuthButton.classList.add("is-loading");
    }

    // Version 7, Milestone 171C: expands/collapses the review form next
    // to a "Write a Review" prompt on the customer's own Order Detail
    // page (components/reviewPrompt.js) — purely a visibility toggle,
    // no data is read or sent until the form itself is submitted.
    const reviewToggle = event.target.closest('[data-action="toggle-review-form"]');
    if (reviewToggle) {
      const form = document.getElementById(reviewToggle.getAttribute("aria-controls"));
      if (!form) return;
      const nowExpanded = form.hidden;
      form.hidden = !nowExpanded;
      reviewToggle.setAttribute("aria-expanded", String(nowExpanded));
      reviewToggle.textContent = nowExpanded ? "Cancel" : "Write a Review";
      return;
    }

    // Version 7, Milestone 174C: the Customer Notification Centre.
    const markReadButton = event.target.closest('[data-action="mark-notification-read"]');
    if (markReadButton) {
      handleMarkNotificationRead(markReadButton);
      return;
    }

    const markAllReadButton = event.target.closest('[data-action="mark-all-notifications-read"]');
    if (markAllReadButton) {
      handleMarkAllNotificationsRead(markAllReadButton);
    }
  });

  document.addEventListener("submit", (event) => {
    const registerForm = event.target.closest("#customer-register-form");
    if (registerForm) {
      event.preventDefault();
      handleCustomerRegisterSubmit(registerForm);
      return;
    }

    const loginForm = event.target.closest("#customer-login-form");
    if (loginForm) {
      event.preventDefault();
      handleCustomerLoginSubmit(loginForm);
      return;
    }

    const forgotPasswordForm = event.target.closest("#customer-forgot-password-form");
    if (forgotPasswordForm) {
      event.preventDefault();
      handleCustomerForgotPasswordSubmit(forgotPasswordForm);
      return;
    }

    const resetPasswordForm = event.target.closest("#customer-reset-password-form");
    if (resetPasswordForm) {
      event.preventDefault();
      handleCustomerResetPasswordSubmit(resetPasswordForm);
      return;
    }

    const reviewForm = event.target.closest("[data-review-form]");
    if (reviewForm) {
      event.preventDefault();
      handleProductReviewSubmit(reviewForm);
      return;
    }

    const preferencesForm = event.target.closest("[data-notification-preferences-form]");
    if (preferencesForm) {
      event.preventDefault();
      handleNotificationPreferencesSubmit(preferencesForm);
    }
  });
}

// Version 7, Milestone 174C: the Customer Notification Centre — mark
// one notification read, or all of them. Both re-render the account
// page so the unread badge/list stay accurate; a failure is silently
// swallowed (never worth interrupting the page for) since the worst
// outcome is just "still shows as unread," not a lost action.
async function handleMarkNotificationRead(button) {
  const id = button.dataset.notificationId;
  if (!id) return;
  button.disabled = true;
  try {
    await markNotificationRead(id);
    rerenderCurrentRoute();
  } catch {
    button.disabled = false;
  }
}

async function handleMarkAllNotificationsRead(button) {
  button.disabled = true;
  try {
    await markAllNotificationsRead();
    rerenderCurrentRoute();
  } catch {
    button.disabled = false;
  }
}

// Version 7, Milestone 174C: engagement preferences — see
// accountPage.js's own PREFERENCE_FIELDS for the checkbox meaning
// (checked = "I want to receive this", i.e. the inverse of each
// backend *OptOut boolean).
async function handleNotificationPreferencesSubmit(form) {
  const banner = form.querySelector("[data-preferences-banner]");
  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  const formData = new FormData(form);
  const preferences = {
    reviewRequestsOptOut: !formData.has("reviewRequestsOptOut"),
    stockAlertsOptOut: !formData.has("stockAlertsOptOut"),
    wishlistAlertsOptOut: !formData.has("wishlistAlertsOptOut"),
    abandonedCheckoutOptOut: !formData.has("abandonedCheckoutOptOut"),
  };

  try {
    await updateMyNotificationPreferences(preferences);
    if (banner) {
      banner.textContent = "Preferences saved.";
      banner.hidden = false;
    }
  } catch (error) {
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// Version 7, Milestone 171C: submits a genuine product review for one
// specific purchased order item (components/reviewPrompt.js). The
// backend independently re-verifies this is a real PAID purchase
// belonging to the logged-in customer — nothing here is trusted beyond
// "which order item and what the customer typed".
async function handleProductReviewSubmit(form) {
  const orderItemId = form.dataset.orderItemId;
  const ratingInput = form.querySelector('[name="rating"]');
  const reviewTextInput = form.querySelector('[name="reviewText"]');
  const banner = form.querySelector("[data-review-form-banner]");
  const submitButton = form.querySelector('button[type="submit"]');

  const rating = Number(ratingInput?.value);
  const reviewText = (reviewTextInput?.value || "").trim();

  function showBanner(text, variant) {
    if (!banner) return;
    banner.textContent = text;
    banner.classList.toggle("form-banner--error", variant === "error");
    banner.classList.toggle("form-banner--success", variant === "success");
    banner.hidden = false;
  }

  if (!ratingInput?.value) {
    showBanner("Please select a rating.", "error");
    ratingInput?.focus();
    return;
  }
  if (reviewText.length < 10) {
    showBanner("Please write at least 10 characters.", "error");
    reviewTextInput?.focus();
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    await submitProductReview({ orderItemId, rating, reviewText });
    const prompt = form.closest("[data-review-prompt]");
    if (prompt) {
      prompt.outerHTML = `
        <div class="review-prompt review-prompt--submitted">
          <p class="review-prompt__product">${escapeHtml(prompt.querySelector(".review-prompt__product")?.textContent || "")}</p>
          <span class="badge">Your review: Pending approval</span>
        </div>
      `;
    }
  } catch (error) {
    if (submitButton) submitButton.disabled = false;
    if (error instanceof ApiError && error.status === 409) {
      showBanner("You have already reviewed this product.", "error");
    } else if (error instanceof ApiError && error.errors?.length) {
      showBanner(error.errors[0].message, "error");
    } else if (error instanceof ApiError) {
      showBanner(error.message, "error");
    } else {
      showBanner("We could not submit your review right now. Please try again shortly.", "error");
    }
  }
}

async function handleCustomerRegisterSubmit(form) {
  clearAccountFormErrors(form);

  const data = {
    firstName: form.querySelector("#registerFirstName")?.value.trim() || "",
    lastName: form.querySelector("#registerLastName")?.value.trim() || "",
    email: form.querySelector("#registerEmail")?.value.trim() || "",
    phone: form.querySelector("#registerPhone")?.value.trim() || "",
    password: form.querySelector("#registerPassword")?.value || "",
    confirmPassword: form.querySelector("#registerConfirmPassword")?.value || "",
  };

  const { isValid, errors } = validateCustomerRegisterForm(data);
  if (!isValid) {
    showAccountFormErrors(form, errors);
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    await registerCustomer(data);
    // Registration also signs the customer in (see
    // customerAuth.controller.ts's registerHandler) — re-rendering
    // /account now correctly shows the logged-in overview.
    rerenderCurrentRoute();
  } catch (error) {
    const message =
      error instanceof ApiError && error.status === 409
        ? "An account with this email already exists. Please log in."
        : unavailableOrGenericMessage(error, "We could not create your account right now. Please try again.");
    showAccountFormBanner(form, message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function handleCustomerLoginSubmit(form) {
  clearAccountFormErrors(form);

  const data = {
    email: form.querySelector("#loginEmail")?.value.trim() || "",
    password: form.querySelector("#loginPassword")?.value || "",
  };

  const { isValid, errors } = validateCustomerLoginForm(data);
  if (!isValid) {
    showAccountFormErrors(form, errors);
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    await loginCustomer(data.email, data.password);
    // Version 7, Milestone 174C, brief section 27: merges this
    // browser's guest wishlist into the account's server-side one —
    // best-effort, never blocks/fails the login itself. The guest
    // Local-Storage wishlist is left untouched afterwards (still the
    // source of truth for this page's own display) — see
    // wishlist.service.ts's own header comment.
    const guestProductIds = getWishlist().map((item) => item.productId);
    if (guestProductIds.length > 0) {
      mergeGuestWishlist(guestProductIds).catch(() => {});
    }
    rerenderCurrentRoute();
  } catch (error) {
    // Deliberately the same generic message regardless of the real
    // cause (wrong email, wrong password) — never hints at which part
    // of the input was wrong, same discipline as admin login.
    const message = unavailableOrGenericMessage(error, "Invalid email or password.");
    showAccountFormBanner(form, message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// Version 7, Milestone 132: always shows the same generic success
// message on a successful call, whatever the entered email actually
// was — the backend already guarantees an identical response for
// every case, so this never tries to infer anything beyond "the
// request went through". A connection failure is the only thing shown
// differently (via unavailableOrGenericMessage), since that's a real,
// visible problem distinct from the generic response.
async function handleCustomerForgotPasswordSubmit(form) {
  clearAccountFormErrors(form);

  const data = { email: form.querySelector("#forgotPasswordEmail")?.value.trim() || "" };

  const { isValid, errors } = validateForgotPasswordForm(data);
  if (!isValid) {
    showAccountFormErrors(form, errors);
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    await forgotPassword(data.email);
    // `.checkout-form` sets `display: flex` (see css/pages.css), which
    // beats the browser's default `[hidden] { display: none }` at equal
    // specificity — setting form.hidden alone would leave the form
    // visually in place. The inline style guarantees it actually hides.
    form.hidden = true;
    form.style.display = "none";
    const successEl = form.closest(".account-page")?.querySelector("[data-customer-forgot-password-success]");
    if (successEl) successEl.hidden = false;
  } catch (error) {
    const message = unavailableOrGenericMessage(error, "We could not process your request right now. Please try again.");
    showAccountFormBanner(form, message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// Version 7, Milestone 132: the reset token itself never touches
// localStorage/sessionStorage — it's read straight off the form's
// data-reset-token attribute (set once at render time from the query
// string, see resetPasswordPage.js) and sent directly in the API call.
async function handleCustomerResetPasswordSubmit(form) {
  clearAccountFormErrors(form);

  const data = {
    password: form.querySelector("#resetPasswordNew")?.value || "",
    confirmPassword: form.querySelector("#resetPasswordConfirm")?.value || "",
  };

  const { isValid, errors } = validateResetPasswordForm(data);
  if (!isValid) {
    showAccountFormErrors(form, errors);
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    const token = form.dataset.resetToken || "";
    await resetPassword(token, data.password, data.confirmPassword);
    // See the same note in handleCustomerForgotPasswordSubmit above —
    // form.hidden alone doesn't visually hide a `.checkout-form`.
    form.hidden = true;
    form.style.display = "none";
    const successEl = form.closest(".account-page")?.querySelector("[data-customer-reset-password-success]");
    if (successEl) successEl.hidden = false;
  } catch (error) {
    const message = unavailableOrGenericMessage(error, "This reset link is invalid or has expired.");
    showAccountFormBanner(form, message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function handleCustomerLogout() {
  try {
    await logoutCustomer();
  } catch {
    // Ignored deliberately — same reasoning as admin logout above:
    // nothing useful to show if logout itself fails.
  }
  rerenderCurrentRoute();
}

// Version 7, Milestone 171F: disconnects a connected social provider
// from Account Settings -> Connected Accounts. The backend independently
// re-enforces "never remove the last usable sign-in method" (see
// socialAuth.service.ts's unlinkProviderFromCustomer) — a 409 here is a
// real, expected outcome, not just a defensive client-side check, so
// its message is shown exactly as the backend sent it (the same
// friendly, non-technical text the OAuth callback's own ?authError=
// last_login_method banner uses).
async function handleDisconnectProvider(button) {
  const provider = button.getAttribute("data-provider");
  if (!provider) return;

  button.disabled = true;
  try {
    await disconnectProvider(provider);
    rerenderCurrentRoute();
  } catch (error) {
    button.disabled = false;
    window.alert(error?.message || "Could not disconnect that provider. Please try again.");
  }
}

// Version 7, Milestone 172B.6: purely client-side — the link itself
// was already rendered from the real backend response, this just puts
// it on the clipboard. navigator.clipboard can be unavailable (very
// old browser, non-HTTPS context) — falls back to a visible "select
// the text" hint rather than a silent failure.
async function handleCopyReferralLink(button) {
  const link = button.dataset.link;
  if (!link) return;

  try {
    await navigator.clipboard.writeText(link);
    const originalText = button.textContent;
    button.textContent = "Copied!";
    setTimeout(() => {
      button.textContent = originalText;
    }, 2000);
  } catch {
    const input = document.getElementById("affiliateReferralLink");
    if (input) {
      input.select();
    }
    window.alert("Could not copy automatically. The link is selected, copy it manually (Ctrl/Cmd+C).");
  }
}

async function handleApplyForAffiliate(button) {
  const banner = document.querySelector("[data-affiliate-apply-banner]");
  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }
  button.disabled = true;

  try {
    await applyForAffiliateProgramme();
    rerenderCurrentRoute();
  } catch (error) {
    button.disabled = false;
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  }
}

// Version 7, Milestone 176: affiliate application/document
// verification — one long form (not a wizard, see
// affiliateApplicationPage.js's own header comment), one delegated
// listener set covering save-draft/submit/document-upload/the two
// conditional-field toggles (identity type, applicant type).
const AFFILIATE_APPLICATION_TEXT_FIELD_IDS = [
  "firstName", "middleName", "surname", "dateOfBirth", "nationality", "idNumber", "passportNumber",
  "contactEmail", "mobileNumber", "whatsappNumber", "preferredContactMethod",
  "addressLine1", "addressLine2", "suburb", "city", "province", "postalCode", "country",
  "businessName", "businessRegistrationNumber", "businessWebsite",
  "promotionPlan", "websiteUrl", "facebookUrl", "instagramUrl", "tiktokUrl", "youtubeUrl", "otherPlatform", "audienceSize", "motivation",
];

function collectAffiliateApplicationFormValues(form) {
  const values = {};
  for (const id of AFFILIATE_APPLICATION_TEXT_FIELD_IDS) {
    const field = form.querySelector(`#${id}`);
    if (field) values[id] = field.value.trim() || null;
  }
  const identityType = form.querySelector("#identityType");
  if (identityType) values.identityType = identityType.value || null;
  const applicantType = form.querySelector("#applicantType");
  if (applicantType) values.applicantType = applicantType.value || null;
  const infoAccurateConfirmed = form.querySelector("#infoAccurateConfirmed");
  if (infoAccurateConfirmed) values.infoAccurateConfirmed = infoAccurateConfirmed.checked;
  const termsAccepted = form.querySelector("#termsAccepted");
  if (termsAccepted) values.termsAccepted = termsAccepted.checked;
  return values;
}

function showAffiliateApplicationBanner(message, isSuccess = false) {
  const errorBanner = document.querySelector("[data-affiliate-application-banner]");
  const successBanner = document.querySelector("[data-affiliate-application-success]");
  if (errorBanner) {
    errorBanner.hidden = isSuccess;
    errorBanner.textContent = isSuccess ? "" : message;
  }
  if (successBanner) {
    successBanner.hidden = !isSuccess;
    successBanner.textContent = isSuccess ? message : "";
  }
}

async function handleSaveAffiliateApplicationDraft(button) {
  const form = document.getElementById("affiliate-application-form");
  if (!form) return;
  button.disabled = true;

  try {
    await updateMyAffiliateApplication(collectAffiliateApplicationFormValues(form));
    showAffiliateApplicationBanner("Draft saved.", true);
  } catch (error) {
    showAffiliateApplicationBanner(error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.");
  } finally {
    button.disabled = false;
  }
}

async function handleSubmitAffiliateApplication(form) {
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    // Save every current field first — submit itself only validates
    // what's already stored server-side, it never reads the form body.
    await updateMyAffiliateApplication(collectAffiliateApplicationFormValues(form));
    await submitMyAffiliateApplication();
    rerenderCurrentRoute();
  } catch (error) {
    showAffiliateApplicationBanner(error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.");
    if (submitButton) submitButton.disabled = false;
  }
}

async function handleUploadAffiliateDocument(button) {
  const slot = button.dataset.slot;
  const fileInput = document.querySelector(`[data-document-file-input][data-slot="${slot}"]`);
  const typeSelect = document.querySelector(`[data-document-type-select][data-slot="${slot}"]`);
  const banner = document.querySelector(`[data-document-upload-banner="${slot}"]`);
  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  const file = fileInput?.files?.[0];
  if (!file) {
    if (banner) {
      banner.textContent = "Please choose a file first.";
      banner.hidden = false;
    }
    return;
  }
  // Only IDENTITY (SA ID vs Passport) and PROOF_OF_RESIDENCE (bank
  // statement vs municipal letter vs other) have a document-type
  // choice — BANKING_CONFIRMATION_LETTER's slot renders no type select
  // at all (see renderDocumentSlot() in affiliateApplicationPage.js),
  // since the slot itself is the document type.
  const requiresTypeSelect = slot === "IDENTITY" || slot === "PROOF_OF_RESIDENCE";
  if (requiresTypeSelect && !typeSelect?.value) {
    if (banner) {
      banner.textContent = "Please select a document type first.";
      banner.hidden = false;
    }
    return;
  }

  button.disabled = true;
  try {
    await uploadMyAffiliateDocument({
      file,
      slot,
      identityDocumentType: slot === "IDENTITY" ? typeSelect.value : undefined,
      proofOfResidenceType: slot === "PROOF_OF_RESIDENCE" ? typeSelect.value : undefined,
    });
    rerenderCurrentRoute();
  } catch (error) {
    button.disabled = false;
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  }
}

function setupAffiliateApplicationForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("#affiliate-application-form");
    if (!form) return;
    event.preventDefault();
    handleSubmitAffiliateApplication(form);
  });

  document.addEventListener("click", (event) => {
    const saveDraftButton = event.target.closest('[data-action="save-affiliate-application-draft"]');
    if (saveDraftButton) {
      handleSaveAffiliateApplicationDraft(saveDraftButton);
      return;
    }
    const uploadButton = event.target.closest('[data-action="upload-affiliate-document"]');
    if (uploadButton) {
      handleUploadAffiliateDocument(uploadButton);
    }
  });

  // Conditional fields — never hidden fields that still submit stale
  // values, since collectAffiliateApplicationFormValues() reads every
  // field's current DOM value regardless of visibility; hiding is pure
  // UX, the backend is the real authority on what's required.
  document.addEventListener("change", (event) => {
    if (event.target.id === "identityType") {
      const idField = document.querySelector("[data-id-number-field]");
      const passportField = document.querySelector("[data-passport-number-field]");
      if (idField) idField.hidden = event.target.value !== "SA_ID";
      if (passportField) passportField.hidden = event.target.value !== "PASSPORT";
    }
    if (event.target.id === "applicantType") {
      const businessFields = document.querySelector("[data-business-fields]");
      if (businessFields) businessFields.hidden = event.target.value !== "BUSINESS";
    }
  });
}

// Admin order status update (Version 7, Milestone 64). Delegated
// listeners so the controls keep working no matter how many times the
// order detail page re-renders (each status change triggers a
// rerenderCurrentRoute(), which replaces the whole page markup).
// adminSelectedNextStatus tracks the status the admin picked between
// clicking a "Move to X" button and confirming the change — cleared
// again as soon as the confirmation form is dismissed or submitted.
const ADMIN_STATUS_NOTE_MAX_LENGTH = 500;
let adminSelectedNextStatus = null;

function setupAdminOrderStatusForm() {
  document.addEventListener("click", (event) => {
    const selectButton = event.target.closest('[data-action="admin-select-next-status"]');
    if (selectButton) {
      handleAdminSelectNextStatus(selectButton);
      return;
    }

    const cancelButton = event.target.closest('[data-action="admin-cancel-status-update"]');
    if (cancelButton) {
      handleAdminCancelStatusSelection(cancelButton);
    }
  });

  document.addEventListener("input", (event) => {
    const textarea = event.target.closest("#adminStatusNote");
    if (!textarea) return;
    updateAdminStatusNoteCount(textarea);
  });

  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-status-confirm]");
    if (!form) return;

    event.preventDefault();
    handleAdminStatusUpdateSubmit(form);
  });
}

function handleAdminSelectNextStatus(button) {
  const container = button.closest(".admin-status-update");
  if (!container) return;

  const currentStatus = container.dataset.currentStatus;
  const nextStatus = button.dataset.status;
  adminSelectedNextStatus = nextStatus;

  const confirmForm = container.querySelector("[data-admin-status-confirm]");
  const confirmText = container.querySelector("[data-admin-status-confirm-text]");
  const cancelWarning = container.querySelector("[data-admin-status-cancel-warning]");
  const noteRequiredHint = container.querySelector("[data-admin-status-note-required]");
  const banner = container.querySelector("[data-admin-status-banner]");
  const textarea = container.querySelector("#adminStatusNote");

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }
  if (textarea) textarea.value = "";
  updateAdminStatusNoteCount(textarea);

  if (confirmText) {
    confirmText.textContent = `Confirm that you want to change this order from ${humanizeEnum(currentStatus)} to ${humanizeEnum(nextStatus)}.`;
  }

  const isCancellation = nextStatus === "CANCELLED";
  if (cancelWarning) cancelWarning.hidden = !isCancellation;
  if (noteRequiredHint) noteRequiredHint.hidden = !isCancellation;

  if (confirmForm) {
    confirmForm.hidden = false;
    confirmForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function handleAdminCancelStatusSelection(button) {
  const container = button.closest(".admin-status-update");
  const confirmForm = container?.querySelector("[data-admin-status-confirm]");
  if (confirmForm) confirmForm.hidden = true;
  adminSelectedNextStatus = null;
}

function updateAdminStatusNoteCount(textarea) {
  if (!textarea) return;
  const container = textarea.closest(".admin-status-update");
  const countEl = container?.querySelector("[data-admin-status-note-count]");
  if (!countEl) return;
  countEl.textContent = String(ADMIN_STATUS_NOTE_MAX_LENGTH - textarea.value.length);
}

async function handleAdminStatusUpdateSubmit(form) {
  const container = form.closest(".admin-status-update");
  const orderNumber = container?.dataset.orderNumber;
  if (!container || !orderNumber || !adminSelectedNextStatus) return;

  const textarea = form.querySelector("#adminStatusNote");
  const banner = form.querySelector("[data-admin-status-banner]");
  const submitButton = form.querySelector('button[type="submit"]');
  const note = textarea ? textarea.value.trim() : "";

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  if (adminSelectedNextStatus === "CANCELLED" && !note) {
    if (banner) {
      banner.textContent = "A note is required when cancelling an order.";
      banner.hidden = false;
    }
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    await updateAdminOrderStatus(orderNumber, adminSelectedNextStatus, note || undefined);
    setPendingAdminMessage(`Order status updated to ${humanizeEnum(adminSelectedNextStatus)}.`);
    adminSelectedNextStatus = null;
    rerenderCurrentRoute();
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    }

    // 400 (invalid status/transition/note) carries a specific,
    // already-safe message from the backend; anything else (404,
    // unreachable backend, unexpected 500) gets a generic message —
    // never a raw stack trace or internal error string.
    const message =
      error instanceof ApiError && error.status === 400
        ? error.message
        : error instanceof ApiError && error.status === 404
          ? "Order not found."
          : "Something went wrong. Please try again shortly.";

    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
    if (submitButton) submitButton.disabled = false;
  }
}

// Admin manual shipping update (Version 7, Milestone 106). Delegated
// the same way as the order status form above — the order detail page
// can re-render (rerenderCurrentRoute()) after a successful save, so a
// direct listener bound once at render time wouldn't survive that.
// Every field is always sent, even blank — an intentionally-blanked
// optional field means "clear it" server-side (adminShipping.service.
// ts's parseOptionalText/parseOptionalDate).
function setupAdminShippingForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest(".admin-shipping-form");
    if (!form) return;

    event.preventDefault();
    handleAdminShippingUpdateSubmit(form);
  });
}

async function handleAdminShippingUpdateSubmit(form) {
  const orderNumber = form.dataset.orderNumber;
  if (!orderNumber) return;

  const banner = form.querySelector("[data-admin-shipping-banner]");
  const submitButton = form.querySelector('button[type="submit"]');

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  const formData = new FormData(form);
  const fields = {
    status: formData.get("status"),
    courierName: formData.get("courierName") || "",
    trackingNumber: formData.get("trackingNumber") || "",
    trackingUrl: formData.get("trackingUrl") || "",
    estimatedDelivery: formData.get("estimatedDelivery") || "",
  };

  if (submitButton) submitButton.disabled = true;

  try {
    await updateAdminShipping(orderNumber, fields);
    setPendingAdminMessage("Shipping details updated.");
    rerenderCurrentRoute();
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    }

    // 400 (invalid status/URL/date) carries a specific, already-safe
    // message from the backend; anything else (404, unreachable
    // backend, unexpected 500) gets a generic message.
    const message =
      error instanceof ApiError && error.status === 400
        ? error.message
        : error instanceof ApiError && error.status === 404
          ? "Order not found."
          : "Something went wrong. Please try again shortly.";

    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
    if (submitButton) submitButton.disabled = false;
  }
}

// Admin Courier Guy rate quote (Version 7, Milestone 108) + booking
// (Version 7, Milestone 112). Delegated the same way as the shipping
// form above. A quote request never mutates the order —
// courierGuy.service.ts's getCourierQuote() only ever calls Courier
// Guy's /rates endpoint. A successful quote response is rendered
// directly into the form's own results container as a selectable list
// (see renderCourierQuoteOption) plus a hidden Book Courier area (see
// renderBookCourierArea/setupAdminBookCourierArea below) — selecting a
// service reveals the Book Courier button; nothing books automatically.
// Disabled/error responses (Courier Guy not enabled, invalid parcel/
// address, etc.) show the same inline banner every other admin form
// here already uses. serviceName/serviceLevelCode come from an
// external provider (Courier Guy), so — unlike this file's own
// hardcoded status messages — they're escaped before being placed in
// innerHTML.
function setupAdminCourierQuoteForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest(".admin-courier-quote-form");
    if (!form) return;

    event.preventDefault();
    handleAdminCourierQuoteSubmit(form);
  });
}

function renderCourierQuoteOption(option, index) {
  const etaFrom = option.etaFrom !== null && option.etaFrom !== undefined ? escapeHtml(String(option.etaFrom)) : null;
  const etaTo = option.etaTo !== null && option.etaTo !== undefined ? escapeHtml(String(option.etaTo)) : null;
  const eta = etaFrom || etaTo ? `<span class="admin-courier-quote-option__eta">ETA: ${etaFrom ?? "?"}${etaTo && etaTo !== etaFrom ? `–${etaTo}` : ""}</span>` : "";
  const code = option.serviceLevelCode ? `<span class="admin-courier-quote-option__code">${escapeHtml(option.serviceLevelCode)}</span>` : "";
  const price = Number(option.price);
  const priceDisplay = Number.isFinite(price) ? `R${price.toFixed(2)}` : "N/A";

  // Version 7, Milestone 112: radio, not a plain list item — this is
  // what "quote options must become selectable" means in practice.
  // data-service-code/-id/-name carry exactly what bookCourierShipment()
  // needs; read back out in handleAdminBookCourierSubmit via the
  // checked radio's own dataset, no separate state to keep in sync.
  return `
    <li class="admin-courier-quote-option">
      <label class="admin-courier-quote-option__label">
        <input
          type="radio"
          name="courierServiceSelection"
          class="admin-courier-quote-option__radio"
          value="${index}"
          data-service-code="${option.serviceLevelCode ? escapeHtml(option.serviceLevelCode) : ""}"
          data-service-id="${option.serviceLevelId ? escapeHtml(String(option.serviceLevelId)) : ""}"
          data-service-name="${escapeHtml(option.serviceName)}"
        />
        <span class="admin-courier-quote-option__name">${escapeHtml(option.serviceName)}</span>
        ${code}
        <span class="admin-courier-quote-option__price">${priceDisplay}</span>
        ${eta}
      </label>
    </li>
  `;
}

// Version 7, Milestone 112: hidden until a service radio above is
// selected. The payment-confirmation checkbox only renders when the
// order isn't already paymentStatus PAID (courierGuy.service.ts's own
// checkPaymentSafety() is the real enforcement — this is just the UI
// asking for the same attestation the backend will require). Reuses
// .admin-status-confirm/.admin-status-confirm__actions, the same
// visual weight the order-status-update confirmation already uses for
// "an important, deliberate action."
function renderBookCourierArea(paymentStatus) {
  const needsPaymentConfirmation = paymentStatus !== "PAID";

  return `
    <div class="admin-book-courier-area" data-admin-book-courier-area hidden>
      <button type="button" class="btn btn--secondary" data-admin-book-courier-trigger>Book Courier</button>
      <div class="admin-status-confirm" data-admin-book-courier-confirm hidden>
        <p class="admin-status-confirm__text">This will create a real Courier Guy shipment.</p>
        <p class="admin-status-confirm__warning">Confirm the delivery address and parcel size are correct before continuing.</p>
        ${
          needsPaymentConfirmation
            ? `
        <label class="admin-status-update__hint">
          <input type="checkbox" data-admin-book-courier-payment-confirmed />
          I confirm the payment has been checked and this order is ready for courier booking.
        </label>
        `
            : ""
        }
        <div class="form-banner form-banner--error" data-admin-book-courier-banner hidden></div>
        <div class="admin-status-confirm__actions">
          <button type="button" class="btn btn--primary" data-admin-book-courier-confirm-button>Confirm Booking</button>
          <button type="button" class="btn btn--secondary" data-admin-book-courier-cancel>Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function handleAdminCourierQuoteSubmit(form) {
  const orderNumber = form.dataset.orderNumber;
  if (!orderNumber) return;

  const banner = form.querySelector("[data-admin-courier-banner]");
  const results = form.querySelector("[data-admin-courier-results]");
  const submitButton = form.querySelector('button[type="submit"]');

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }
  if (results) results.innerHTML = "";

  const formData = new FormData(form);
  const payload = {
    weightKg: formData.get("weightKg"),
    lengthCm: formData.get("lengthCm"),
    widthCm: formData.get("widthCm"),
    heightCm: formData.get("heightCm"),
    declaredValue: formData.get("declaredValue") || undefined,
  };

  if (submitButton) submitButton.disabled = true;

  try {
    const response = await getAdminCourierQuote(orderNumber, payload);
    const { options, message } = response.data;

    if (results) {
      if (!options || options.length === 0) {
        results.innerHTML = `<p class="admin-empty">${escapeHtml(message || "No courier quote options were returned for this address and parcel.")}</p>`;
      } else {
        const paymentStatus = form.dataset.paymentStatus || "";
        results.innerHTML = `<ul class="admin-courier-quote-options">${options.map(renderCourierQuoteOption).join("")}</ul>${renderBookCourierArea(paymentStatus)}`;
      }
    }
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    }

    // 503 (Courier Guy not enabled), 400 (invalid parcel/address), 500
    // (enabled but misconfigured), and 502 (Courier Guy unreachable or
    // returned something this normalizer couldn't recognise) all carry
    // a specific, already-safe message from the backend; anything else
    // gets a generic message.
    const message =
      error instanceof ApiError && [400, 500, 502, 503].includes(error.status)
        ? error.message
        : error instanceof ApiError && error.status === 404
          ? "Order not found."
          : "Something went wrong. Please try again shortly.";

    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// Admin Courier Guy BOOKING (Version 7, Milestone 112). Three delegated
// interactions inside the Book Courier area rendered above: selecting
// a service radio reveals the Book Courier button; clicking it reveals
// the confirmation block (never books yet); clicking Confirm Booking
// actually submits. Clicking Cancel collapses the confirmation back
// without booking. None of this books automatically — every step is a
// deliberate admin click, and the backend re-validates payment/parcel/
// address/duplicate-booking regardless of what this UI already checked.
function setupAdminBookCourierArea() {
  document.addEventListener("change", (event) => {
    if (event.target.name !== "courierServiceSelection") return;

    const area = event.target.closest("form")?.querySelector("[data-admin-book-courier-area]");
    if (area) area.hidden = false;
  });

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-admin-book-courier-trigger]");
    if (trigger) {
      const area = trigger.closest("[data-admin-book-courier-area]");
      trigger.hidden = true;
      area.querySelector("[data-admin-book-courier-confirm]").hidden = false;
      return;
    }

    const cancel = event.target.closest("[data-admin-book-courier-cancel]");
    if (cancel) {
      const area = cancel.closest("[data-admin-book-courier-area]");
      area.querySelector("[data-admin-book-courier-confirm]").hidden = true;
      area.querySelector("[data-admin-book-courier-trigger]").hidden = false;
      return;
    }

    const confirmButton = event.target.closest("[data-admin-book-courier-confirm-button]");
    if (confirmButton) {
      const form = confirmButton.closest(".admin-courier-quote-form");
      if (form) handleAdminBookCourierSubmit(form);
    }
  });
}

async function handleAdminBookCourierSubmit(form) {
  const orderNumber = form.dataset.orderNumber;
  if (!orderNumber) return;

  const selectedRadio = form.querySelector('input[name="courierServiceSelection"]:checked');
  if (!selectedRadio) return;

  const banner = form.querySelector("[data-admin-book-courier-banner]");
  const confirmButton = form.querySelector("[data-admin-book-courier-confirm-button]");
  const paymentConfirmedInput = form.querySelector("[data-admin-book-courier-payment-confirmed]");

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  const formData = new FormData(form);
  const payload = {
    weightKg: formData.get("weightKg"),
    lengthCm: formData.get("lengthCm"),
    widthCm: formData.get("widthCm"),
    heightCm: formData.get("heightCm"),
    declaredValue: formData.get("declaredValue") || undefined,
    serviceLevelCode: selectedRadio.dataset.serviceCode || undefined,
    serviceLevelId: selectedRadio.dataset.serviceId || undefined,
    // Only meaningful when the checkbox actually rendered (order not
    // already PAID) — undefined otherwise, which
    // courierGuy.service.ts's checkPaymentSafety() correctly treats as
    // "not confirmed" for a PENDING order and simply ignores for a PAID
    // one.
    paymentConfirmed: paymentConfirmedInput ? paymentConfirmedInput.checked : undefined,
  };

  if (confirmButton) confirmButton.disabled = true;

  try {
    await bookAdminCourier(orderNumber, payload);
    // Full re-render (not just a local DOM update) so the Shipping
    // card's read-only summary, the Update Shipping form's pre-filled
    // values, and this card's own "already booked" state (server-
    // truth-driven, see renderCourierSection) all reflect the booking
    // that just happened — same pattern as handleAdminShippingUpdateSubmit.
    setPendingAdminMessage("Courier shipment booked successfully.");
    rerenderCurrentRoute();
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    }

    // 400 (invalid parcel/address/unpaid), 404 (order not found), 409
    // (already booked), 500 (misconfigured), 502 (provider error/
    // unrecognised response), and 503 (courier/booking disabled) all
    // carry a specific, already-safe message from the backend.
    const message =
      error instanceof ApiError && [400, 404, 409, 500, 502, 503].includes(error.status)
        ? error.message
        : "Something went wrong. Please try again shortly.";

    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
    if (confirmButton) confirmButton.disabled = false;
  }
}

// Admin product filters (Version 7, Milestone 67). The filter form
// doesn't submit to an API directly — it just rebuilds the URL hash
// with the chosen search/status/category values (page reset to 1) and
// lets the router's own re-render pick them up, same as every other
// query-string-driven admin list.
function setupAdminProductFilterForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-product-filter-form]");
    if (!form) return;

    event.preventDefault();

    const search = form.querySelector('input[name="search"]')?.value.trim() || "";
    const status = form.querySelector('select[name="status"]')?.value || "";
    const categoryId = form.querySelector('select[name="categoryId"]')?.value || "";

    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (categoryId) params.set("categoryId", categoryId);
    params.set("page", "1");

    navigateTo(`/admin/products?${params.toString()}`);
  });
}

// Admin product create/edit form (Version 7, Milestone 67). One
// delegated submit handler for both pages — data-mode on the form
// (set by adminProductForm.js) decides whether this calls
// createAdminProduct or updateAdminProduct. SKU/slug are never read
// from the edit form at all (they're rendered as read-only text, not
// inputs, on that page) — the payload sent on edit simply never
// contains those keys, matching the backend's own restricted-fields
// enforcement rather than relying on it alone.
function setupAdminProductForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-product-form]");
    if (!form) return;

    event.preventDefault();
    handleAdminProductFormSubmit(form);
  });

  // Version 7, Milestone 152: shows/hides the Digital Terms Note +
  // Download Enabled fields as the owner switches Product Type —
  // purely a display convenience; the actual create/update payload
  // already reads productType directly from the select regardless of
  // which fields are currently visible.
  document.addEventListener("change", (event) => {
    if (!event.target.matches("[data-admin-product-type-select]")) return;
    const form = event.target.closest("[data-admin-product-form]");
    const digitalFields = form?.querySelector("[data-admin-digital-fields]");
    if (digitalFields) digitalFields.hidden = event.target.value !== "DIGITAL";
  });
}

function parseAdminProductFeatures(rawText) {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 20);
}

function readAdminProductFormValues(form) {
  const name = form.querySelector("#productName")?.value.trim() || "";
  const categoryId = form.querySelector("#productCategory")?.value || "";
  const shortDescription = form.querySelector("#productShortDescription")?.value.trim() || "";
  const description = form.querySelector("#productDescription")?.value.trim() || "";
  const priceRaw = form.querySelector("#productPrice")?.value;
  const oldPriceRaw = form.querySelector("#productOldPrice")?.value;
  const stockRaw = form.querySelector("#productStock")?.value;
  const lowStockThresholdRaw = form.querySelector("#productLowStockThreshold")?.value;
  const status = form.querySelector("#productStatus")?.value || "DRAFT";
  const ageRange = form.querySelector("#productAgeRange")?.value.trim() || "";
  const featuresText = form.querySelector("#productFeatures")?.value || "";
  const discountLabel = form.querySelector("#productDiscountLabel")?.value.trim() || "";
  const isFeatured = form.querySelector("#productIsFeatured")?.checked || false;
  const isBestSeller = form.querySelector("#productIsBestSeller")?.checked || false;
  const isNewArrival = form.querySelector("#productIsNewArrival")?.checked || false;
  const productType = form.querySelector("#productType")?.value || "PHYSICAL";
  const digitalTermsNote = form.querySelector("#productDigitalTermsNote")?.value.trim() || "";
  const downloadEnabled = form.querySelector("#productDownloadEnabled")?.checked ?? true;

  return {
    name,
    categoryId,
    shortDescription: shortDescription || null,
    description: description || null,
    price: priceRaw ? Number(priceRaw) : NaN,
    oldPrice: oldPriceRaw ? Number(oldPriceRaw) : null,
    stockQuantity: stockRaw === "" ? NaN : Number(stockRaw),
    lowStockThreshold: lowStockThresholdRaw === "" ? 5 : Number(lowStockThresholdRaw),
    status,
    ageRange: ageRange || null,
    features: parseAdminProductFeatures(featuresText),
    discountLabel: discountLabel || null,
    isFeatured,
    isBestSeller,
    isNewArrival,
    productType,
    digitalTermsNote: digitalTermsNote || null,
    downloadEnabled,
  };
}

// Client-side validation is a UX convenience only — the backend
// (adminProduct.service.ts) independently re-validates every field
// regardless and remains the final authority.
function validateAdminProductForm(values, mode) {
  if (!values.name) return "Name is required.";
  if (!values.categoryId) return "Category is required.";
  if (!Number.isFinite(values.price) || values.price <= 0) return "Price must be a number greater than 0.";
  if (!Number.isInteger(values.stockQuantity) || values.stockQuantity < 0) return "Stock quantity must be a whole number of 0 or more.";
  if (!Number.isInteger(values.lowStockThreshold) || values.lowStockThreshold < 0) return "Low stock threshold must be a whole number of 0 or more.";
  if (values.oldPrice !== null && (!Number.isFinite(values.oldPrice) || values.oldPrice <= 0)) return "Old price must be a number greater than 0.";

  if (mode === "create") {
    const sku = document.getElementById("productSku")?.value.trim();
    if (!sku) return "SKU is required.";
  }

  // Version 7, Milestone 152: UX convenience only, mirroring
  // adminProduct.service.ts's own assertDigitalProductHasFileIfActive()
  // — the backend remains the final authority regardless of what
  // passes here.
  if (values.productType === "DIGITAL" && values.status === "ACTIVE") {
    const hasFile = Boolean(document.querySelector("[data-admin-digital-asset-card]"));
    if (mode === "create" || !hasFile) {
      return "A digital product cannot be Active until a digital file has been uploaded. Save as Draft first, then upload the file.";
    }
  }

  const descriptionCharacterCount = getDescriptionVisibleCharacterCount("productDescription");
  if (descriptionCharacterCount > MAX_DESCRIPTION_VISIBLE_CHARACTERS) {
    return `Full Description must be ${MAX_DESCRIPTION_VISIBLE_CHARACTERS} visible characters or fewer (currently ${descriptionCharacterCount}).`;
  }

  return null;
}

async function handleAdminProductFormSubmit(form) {
  const mode = form.dataset.mode;
  const banner = form.querySelector("[data-admin-product-banner]");
  const submitButton = form.querySelector('button[type="submit"]');

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  const values = readAdminProductFormValues(form);
  const validationError = validateAdminProductForm(values, mode);
  if (validationError) {
    if (banner) {
      banner.textContent = validationError;
      banner.hidden = false;
    }
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    if (mode === "create") {
      const sku = document.getElementById("productSku")?.value.trim();
      const slug = document.getElementById("productSlug")?.value.trim();

      const payload = { ...values, sku };
      if (slug) payload.slug = slug;

      const response = await createAdminProduct(payload);
      setPendingAdminMessage(`Product "${response.data.name}" created successfully.`);
      navigateTo(`/admin/products/${encodeURIComponent(response.data.id)}/edit`);
    } else {
      const productId = form.dataset.productId;
      // sku/slug are never included here at all — the edit page never
      // renders them as inputs, so there is nothing to read.
      await updateAdminProduct(productId, values);
      setPendingAdminMessage("Product updated successfully.");
      rerenderCurrentRoute();
    }
  } catch (error) {
    let message = "Something went wrong. Please try again shortly.";
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    } else if (error instanceof ApiError && (error.status === 400 || error.status === 409)) {
      message = error.message;
    } else if (error instanceof ApiError && error.status === 404) {
      message = "Product not found.";
    } else if (error instanceof ApiUnavailableError) {
      message = "We could not connect to the admin system right now. Please try again shortly.";
    }

    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// Admin product images (Version 7, Milestone 70). Uses the protected
// image routes already live from Milestone 69 — this file only adds
// the UI wiring, no new backend behaviour. No delete/remove action
// exists here by design (see VERSION_7_PRODUCT_IMAGE_UPLOAD_PLAN.md
// Section 10) — only upload, set-primary, and alt-text edit.
const MAX_ADMIN_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024; // kept in sync with adminProductImage.service.ts
const ALLOWED_ADMIN_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

function setupAdminProductImages() {
  document.addEventListener("submit", (event) => {
    const uploadForm = event.target.closest("[data-admin-image-upload-form]");
    if (uploadForm) {
      event.preventDefault();
      handleAdminImageUploadSubmit(uploadForm);
      return;
    }

    const altForm = event.target.closest("[data-admin-image-alt-form]");
    if (altForm) {
      event.preventDefault();
      handleAdminImageAltSubmit(altForm);
    }
  });

  document.addEventListener("click", (event) => {
    const setPrimaryButton = event.target.closest("[data-admin-image-set-primary]");
    if (setPrimaryButton) {
      handleAdminImageSetPrimary(setPrimaryButton);
      return;
    }

    const altToggleButton = event.target.closest("[data-admin-image-alt-toggle]");
    if (altToggleButton) {
      const card = altToggleButton.closest("[data-admin-image-card]");
      const form = card?.querySelector("[data-admin-image-alt-form]");
      if (form) form.hidden = !form.hidden;
      return;
    }

    const altCancelButton = event.target.closest("[data-admin-image-alt-cancel]");
    if (altCancelButton) {
      const card = altCancelButton.closest("[data-admin-image-card]");
      const form = card?.querySelector("[data-admin-image-alt-form]");
      const input = form?.querySelector("[data-admin-image-alt-input]");
      if (input) input.value = input.defaultValue;
      if (form) form.hidden = true;
      return;
    }

    const removeButton = event.target.closest("[data-admin-image-remove]");
    if (removeButton) {
      handleAdminImageRemove(removeButton);
    }
  });
}

// Version 7, Milestone 171C: review moderation only — approve/reject an
// existing PENDING review. Neither button creates a review; both just
// call the matching backend endpoint (which itself only accepts a
// review that's currently PENDING — see adminProductReview.service.ts).
function setupAdminReviewModeration() {
  document.addEventListener("click", (event) => {
    const approveButton = event.target.closest('[data-action="approve-review"]');
    if (approveButton) {
      handleAdminReviewModeration(approveButton, approveAdminReview, "approved");
      return;
    }

    const rejectButton = event.target.closest('[data-action="reject-review"]');
    if (rejectButton) {
      handleAdminReviewModeration(rejectButton, rejectAdminReview, "rejected");
    }
  });
}

async function handleAdminReviewModeration(button, apiCall, verb) {
  const reviewId = button.dataset.reviewId;
  const row = button.closest("[data-review-row]");
  const banner = document.querySelector("[data-admin-reviews-banner]");
  const rowButtons = row?.querySelectorAll("button") || [];

  rowButtons.forEach((btn) => (btn.disabled = true));

  try {
    await apiCall(reviewId);
    if (row) {
      row.remove();
    }
    if (banner) {
      banner.textContent = `Review ${verb}.`;
      banner.classList.remove("form-banner--error");
      banner.classList.add("form-banner--success");
      banner.hidden = false;
    }
  } catch (error) {
    rowButtons.forEach((btn) => (btn.disabled = false));
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.classList.remove("form-banner--success");
      banner.classList.add("form-banner--error");
      banner.hidden = false;
    }
  }
}

// Admin affiliate products (Version 7, Milestone 172B). Same filter/
// form/action wiring shape as the product management functions above,
// applied to the new, fully separate AffiliateProduct admin surface.
// Nothing here is public — no cart/checkout/Merchant-feed code is
// imported or touched anywhere in this section.
function setupAdminAffiliateFilterForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-affiliate-filter-form]");
    if (!form) return;

    event.preventDefault();

    const search = form.querySelector('input[name="search"]')?.value.trim() || "";
    const isActive = form.querySelector('select[name="isActive"]')?.value || "";

    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (isActive) params.set("isActive", isActive);
    params.set("page", "1");

    navigateTo(`/admin/affiliate?${params.toString()}`);
  });
}

function setupAdminAffiliateForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-affiliate-form]");
    if (!form) return;

    event.preventDefault();
    handleAdminAffiliateFormSubmit(form);
  });
}

function readAdminAffiliateFormValues(form) {
  const title = form.querySelector("#affiliateTitle")?.value.trim() || "";
  const author = form.querySelector("#affiliateAuthor")?.value.trim() || "";
  const slug = form.querySelector("#affiliateSlug")?.value.trim() || "";
  const trackingSlug = form.querySelector("#affiliateTrackingSlug")?.value.trim() || "";
  const description = form.querySelector("#affiliateDescription")?.value.trim() || "";
  const imageUrl = form.querySelector("#affiliateImageUrl")?.value.trim() || "";
  const category = form.querySelector("#affiliateCategory")?.value.trim() || "";
  const merchantName = form.querySelector("#affiliateMerchantName")?.value.trim() || "";
  const affiliateNetwork = form.querySelector("#affiliateNetwork")?.value.trim() || "";
  const affiliateUrl = form.querySelector("#affiliateUrl")?.value.trim() || "";
  const priceRaw = form.querySelector("#affiliatePrice")?.value;
  const currency = form.querySelector("#affiliateCurrency")?.value.trim() || "ZAR";
  const discountText = form.querySelector("#affiliateDiscountText")?.value.trim() || "";
  const ratingRaw = form.querySelector("#affiliateRating")?.value;
  const isFeatured = form.querySelector("#affiliateIsFeatured")?.checked || false;
  const isActive = form.querySelector("#affiliateIsActive")?.checked ?? true;

  return {
    title,
    author: author || null,
    slug: slug || undefined,
    trackingSlug: trackingSlug || undefined,
    description: description || null,
    imageUrl: imageUrl || null,
    category: category || null,
    merchantName,
    affiliateNetwork: affiliateNetwork || null,
    affiliateUrl,
    price: priceRaw ? Number(priceRaw) : null,
    currency,
    discountText: discountText || null,
    rating: ratingRaw ? Number(ratingRaw) : null,
    isFeatured,
    isActive,
  };
}

// Client-side validation is a UX convenience only — the backend
// (adminAffiliateProduct.service.ts, including affiliateUrl.validator.ts)
// independently re-validates every field regardless and remains the
// final authority, same discipline as validateAdminProductForm() above.
function validateAdminAffiliateForm(values) {
  if (!values.title) return "Title is required.";
  if (!values.merchantName) return "Merchant is required.";
  if (!values.affiliateUrl) return "Affiliate URL is required.";
  try {
    const parsed = new URL(values.affiliateUrl);
    if (parsed.protocol !== "https:") return "Affiliate URL must start with https://.";
  } catch {
    return "Affiliate URL must be a valid, absolute URL.";
  }
  if (values.price !== null && (!Number.isFinite(values.price) || values.price < 0)) return "Price must be a non-negative number.";
  if (values.rating !== null && (!Number.isFinite(values.rating) || values.rating < 0 || values.rating > 5)) return "Rating must be a number between 0 and 5.";
  return null;
}

async function handleAdminAffiliateFormSubmit(form) {
  const mode = form.dataset.mode;
  const banner = form.querySelector("[data-admin-affiliate-form-banner]");
  const submitButton = form.querySelector('button[type="submit"]');

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  const values = readAdminAffiliateFormValues(form);
  const validationError = validateAdminAffiliateForm(values);
  if (validationError) {
    if (banner) {
      banner.textContent = validationError;
      banner.hidden = false;
    }
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    if (mode === "create") {
      const response = await createAdminAffiliateProduct(values);
      setPendingAdminMessage(`Affiliate product "${response.data.title}" created successfully.`);
      navigateTo(`/admin/affiliate/${encodeURIComponent(response.data.id)}/edit`);
    } else {
      const affiliateProductId = form.dataset.affiliateProductId;
      // slug/trackingSlug are only included when the field actually
      // changed from what was rendered — readAdminAffiliateFormValues()
      // always reads the current input value, so an untouched field
      // round-trips as the same value it was loaded with, never
      // silently cleared or regenerated by an unrelated edit.
      await updateAdminAffiliateProduct(affiliateProductId, values);
      setPendingAdminMessage("Affiliate product updated successfully.");
      rerenderCurrentRoute();
    }
  } catch (error) {
    let message = "Something went wrong. Please try again shortly.";
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    } else if (error instanceof ApiError && (error.status === 400 || error.status === 409)) {
      message = error.message;
    } else if (error instanceof ApiError && error.status === 404) {
      message = "Affiliate product not found.";
    } else if (error instanceof ApiUnavailableError) {
      message = "We could not connect to the admin system right now. Please try again shortly.";
    }

    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

const ADMIN_AFFILIATE_ACTIONS = {
  "activate-affiliate-product": { apiCall: activateAdminAffiliateProduct, verb: "activated" },
  "deactivate-affiliate-product": { apiCall: deactivateAdminAffiliateProduct, verb: "deactivated" },
  "feature-affiliate-product": { apiCall: featureAdminAffiliateProduct, verb: "featured" },
  "unfeature-affiliate-product": { apiCall: unfeatureAdminAffiliateProduct, verb: "unfeatured" },
};

function setupAdminAffiliateActions() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = ADMIN_AFFILIATE_ACTIONS[button.dataset.action];
    if (!action) return;

    handleAdminAffiliateAction(button, action.apiCall, action.verb);
  });
}

async function handleAdminAffiliateAction(button, apiCall, verb) {
  const affiliateProductId = button.dataset.affiliateProductId;
  const row = button.closest("[data-affiliate-product-row]");
  const banner = document.querySelector("[data-admin-affiliate-banner]");
  const rowButtons = row?.querySelectorAll("button") || [];

  rowButtons.forEach((btn) => (btn.disabled = true));
  if (banner) banner.hidden = true;

  try {
    await apiCall(affiliateProductId);
    setPendingAdminMessage(`Affiliate product ${verb}.`);
    rerenderCurrentRoute();
  } catch (error) {
    rowButtons.forEach((btn) => (btn.disabled = false));
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  }
}

// Seasonedz's own affiliate/referral programme admin (Version 7,
// Milestone 172B.3). Same filter/form/action wiring shape as the
// affiliate-product functions above, applied to the new, fully
// separate Referrals admin surface. No checkout/discount/commission
// code is touched anywhere in this section — creating or editing an
// Affiliate here has no effect on the live storefront.
function setupAdminReferralAffiliateFilterForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-referral-affiliate-filter-form]");
    if (!form) return;

    event.preventDefault();

    const search = form.querySelector('input[name="search"]')?.value.trim() || "";
    const status = form.querySelector('select[name="status"]')?.value || "";

    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    params.set("page", "1");

    navigateTo(`/admin/referrals/affiliates?${params.toString()}`);
  });
}

function setupAdminReferralAffiliateForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-referral-affiliate-form]");
    if (!form) return;

    event.preventDefault();
    handleAdminReferralAffiliateFormSubmit(form);
  });
}

function readAdminReferralAffiliateFormValues(form) {
  const name = form.querySelector("#referralAffiliateName")?.value.trim() || "";
  const email = form.querySelector("#referralAffiliateEmail")?.value.trim() || "";
  const phone = form.querySelector("#referralAffiliatePhone")?.value.trim() || "";
  const referralCode = form.querySelector("#referralAffiliateCode")?.value.trim() || "";
  const commissionRateOverrideRaw = form.querySelector("#referralAffiliateCommissionOverride")?.value;
  const discountRateOverrideRaw = form.querySelector("#referralAffiliateDiscountOverride")?.value;
  const customerId = form.querySelector("#referralAffiliateCustomerId")?.value.trim() || "";
  const notes = form.querySelector("#referralAffiliateNotes")?.value.trim() || "";

  return {
    name,
    email,
    phone: phone || null,
    referralCode: referralCode || undefined,
    commissionRateOverride: commissionRateOverrideRaw ? Number(commissionRateOverrideRaw) : null,
    discountRateOverride: discountRateOverrideRaw ? Number(discountRateOverrideRaw) : null,
    customerId: customerId || null,
    notes: notes || null,
  };
}

// Client-side validation is a UX convenience only — the backend
// (referralAffiliate.service.ts) independently re-validates every
// field regardless and remains the final authority.
function validateAdminReferralAffiliateForm(values) {
  if (!values.name) return "Name is required.";
  if (!values.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return "A valid email is required.";
  if (values.commissionRateOverride !== null && (!Number.isFinite(values.commissionRateOverride) || values.commissionRateOverride < 0 || values.commissionRateOverride > 50)) {
    return "Commission rate override must be a number between 0 and 50.";
  }
  if (values.discountRateOverride !== null && (!Number.isFinite(values.discountRateOverride) || values.discountRateOverride < 0 || values.discountRateOverride > 50)) {
    return "Referral discount override must be a number between 0 and 50.";
  }
  return null;
}

async function handleAdminReferralAffiliateFormSubmit(form) {
  const mode = form.dataset.mode;
  const banner = form.querySelector("[data-admin-referral-affiliate-form-banner]");
  const submitButton = form.querySelector('button[type="submit"]');

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  const values = readAdminReferralAffiliateFormValues(form);
  const validationError = validateAdminReferralAffiliateForm(values);
  if (validationError) {
    if (banner) {
      banner.textContent = validationError;
      banner.hidden = false;
    }
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    if (mode === "create") {
      const response = await createAdminAffiliate(values);
      setPendingAdminMessage(`Affiliate "${response.data.name}" created successfully.`);
      navigateTo(`/admin/referrals/affiliates/${encodeURIComponent(response.data.id)}/edit`);
    } else {
      const affiliateId = form.dataset.affiliateId;
      // email/customerId/referralCode/notes/overrides are only ever
      // read from this form's current input values — an untouched
      // field round-trips as the same value it was loaded with, never
      // silently cleared by an unrelated edit.
      await updateAdminAffiliate(affiliateId, values);
      setPendingAdminMessage("Affiliate updated successfully.");
      rerenderCurrentRoute();
    }
  } catch (error) {
    let message = "Something went wrong. Please try again shortly.";
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    } else if (error instanceof ApiError && (error.status === 400 || error.status === 409)) {
      message = error.message;
    } else if (error instanceof ApiError && error.status === 404) {
      message = "Affiliate not found.";
    } else if (error instanceof ApiUnavailableError) {
      message = "We could not connect to the admin system right now. Please try again shortly.";
    }

    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

const ADMIN_REFERRAL_AFFILIATE_ACTIONS = {
  "approve-affiliate": { apiCall: approveAdminAffiliate, verb: "approved" },
  "reject-affiliate": { apiCall: rejectAdminAffiliate, verb: "rejected" },
  "suspend-affiliate": { apiCall: suspendAdminAffiliate, verb: "suspended" },
  "reactivate-affiliate": { apiCall: reactivateAdminAffiliate, verb: "reactivated" },
};

function setupAdminReferralAffiliateActions() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = ADMIN_REFERRAL_AFFILIATE_ACTIONS[button.dataset.action];
    if (!action) return;

    handleAdminReferralAffiliateAction(button, action.apiCall, action.verb);
  });
}

async function handleAdminReferralAffiliateAction(button, apiCall, verb) {
  const affiliateId = button.dataset.affiliateId;
  const row = button.closest("[data-affiliate-row]");
  const banner = document.querySelector("[data-admin-referral-affiliate-banner]");
  const rowButtons = row?.querySelectorAll("button") || [];

  rowButtons.forEach((btn) => (btn.disabled = true));
  if (banner) banner.hidden = true;

  try {
    await apiCall(affiliateId);
    setPendingAdminMessage(`Affiliate ${verb}.`);
    rerenderCurrentRoute();
  } catch (error) {
    rowButtons.forEach((btn) => (btn.disabled = false));
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Milestone 178, Part C: Affiliate Products — per-product commission
// configuration. Deliberately named/wired apart from the OLD dormant
// AffiliateProduct admin area's own setup* functions above (see
// adminReferralsApi.js's own header comment on the naming collision
// this avoided).
// ---------------------------------------------------------------------------

function setupAdminAffiliateProductSettingFilterForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-affiliate-product-filter-form]");
    if (!form) return;

    event.preventDefault();
    const search = form.querySelector('input[name="search"]')?.value.trim() || "";
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", "1");
    navigateTo(`/admin/referrals/affiliate-products?${params.toString()}`);
  });
}

async function handleAffiliateProductCandidateSearch(button) {
  const container = button.closest("[data-affiliate-product-picker]");
  const input = container?.querySelector("#affiliateProductSearch");
  const resultsEl = container?.querySelector("[data-affiliate-product-search-results]");
  const term = input?.value.trim() || "";
  if (!resultsEl) return;

  if (!term) {
    resultsEl.innerHTML = `<p class="admin-product-form__hint">Type a product name or SKU, then search.</p>`;
    return;
  }

  button.disabled = true;
  try {
    const response = await getAdminProducts({ search: term, limit: 10 });
    resultsEl.innerHTML = renderProductSearchResults(response.data.products);
  } catch (error) {
    resultsEl.innerHTML = `<p class="admin-product-form__hint">${error instanceof ApiError ? error.message : "Something went wrong searching products."}</p>`;
  } finally {
    button.disabled = false;
  }
}

function handleAffiliateProductCandidateSelect(button) {
  const form = button.closest("[data-admin-affiliate-product-form]");
  if (!form) return;

  const productIdField = form.querySelector("#affiliateProductId");
  if (productIdField) productIdField.value = button.dataset.productId;

  const previewEl = form.querySelector("[data-affiliate-product-selected-preview]");
  if (previewEl) {
    previewEl.innerHTML = renderSelectedProductPreview({
      name: button.dataset.productName,
      sku: button.dataset.productSku,
      price: button.dataset.productPrice,
    });
  }

  const resultsEl = form.querySelector("[data-affiliate-product-search-results]");
  if (resultsEl) resultsEl.innerHTML = "";
  const searchInput = form.querySelector("#affiliateProductSearch");
  if (searchInput) searchInput.value = "";

  const errorEl = form.querySelector('[data-error-for="affiliateProductId"]');
  if (errorEl) errorEl.textContent = "";
}

function toggleAffiliateProductCommissionTypeFields(form) {
  const type = form.querySelector("#affiliateProductCommissionType")?.value || "PERCENTAGE";
  const percentField = form.querySelector("[data-affiliate-product-percent-field]");
  const fixedField = form.querySelector("[data-affiliate-product-fixed-field]");
  if (percentField) percentField.hidden = type === "FIXED_AMOUNT";
  if (fixedField) fixedField.hidden = type === "PERCENTAGE";
}

function readAdminAffiliateProductFormValues(form) {
  const commissionType = form.querySelector("#affiliateProductCommissionType")?.value || "PERCENTAGE";
  const percentRaw = form.querySelector("#affiliateProductCommissionPercent")?.value;
  const fixedRaw = form.querySelector("#affiliateProductFixedAmount")?.value;
  const maxRaw = form.querySelector("#affiliateProductMaxCommission")?.value;
  const startsAt = form.querySelector("#affiliateProductStartsAt")?.value || null;
  const endsAt = form.querySelector("#affiliateProductEndsAt")?.value || null;
  const isAffiliateAvailable = form.querySelector("#affiliateProductAvailable")?.checked ?? true;

  return {
    productId: form.querySelector("#affiliateProductId")?.value || null,
    commissionType,
    commissionPercent: commissionType === "PERCENTAGE" && percentRaw ? Number(percentRaw) : null,
    fixedCommissionAmount: commissionType === "FIXED_AMOUNT" && fixedRaw ? Number(fixedRaw) : null,
    maximumCommission: maxRaw ? Number(maxRaw) : null,
    startsAt,
    endsAt,
    isAffiliateAvailable,
  };
}

function validateAdminAffiliateProductForm(values, mode) {
  if (mode === "create" && !values.productId) return "Please search for and select a product first.";
  if (values.commissionType === "FIXED_AMOUNT" && (values.fixedCommissionAmount === null || values.fixedCommissionAmount < 0)) {
    return "A fixed commission amount of 0 or more is required.";
  }
  if (values.commissionType === "PERCENTAGE" && values.commissionPercent !== null && (values.commissionPercent < 0 || values.commissionPercent > 100)) {
    return "Commission % must be between 0 and 100.";
  }
  if (values.maximumCommission !== null && values.maximumCommission < 0) return "Maximum commission cannot be negative.";
  if (values.startsAt && values.endsAt && values.startsAt > values.endsAt) return "The start date must be before the end date.";
  return null;
}

async function handleAdminAffiliateProductFormSubmit(form) {
  const mode = form.dataset.mode;
  const banner = form.querySelector("[data-admin-affiliate-product-form-banner]");
  const submitButton = form.querySelector('button[type="submit"]');

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  const values = readAdminAffiliateProductFormValues(form);
  const validationError = validateAdminAffiliateProductForm(values, mode);
  if (validationError) {
    if (banner) {
      banner.textContent = validationError;
      banner.hidden = false;
    }
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    if (mode === "create") {
      const { productId, ...payload } = values;
      await createAdminAffiliateProductSetting(productId, payload);
      setPendingAdminMessage("Product added to the Affiliate Programme.");
    } else {
      const id = form.dataset.affiliateProductId;
      const { productId, ...payload } = values;
      await updateAdminAffiliateProductSetting(id, payload);
      setPendingAdminMessage("Affiliate product updated.");
    }
    navigateTo("/admin/referrals/affiliate-products");
  } catch (error) {
    let message = "Something went wrong. Please try again shortly.";
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    } else if (error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 409)) {
      message = error.message;
    }
    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function setupAdminAffiliateProductSettingForm() {
  document.addEventListener("click", (event) => {
    const searchButton = event.target.closest('[data-action="search-affiliate-product-candidates"]');
    if (searchButton) {
      handleAffiliateProductCandidateSearch(searchButton);
      return;
    }
    const selectButton = event.target.closest('[data-action="select-affiliate-product-candidate"]');
    if (selectButton) {
      handleAffiliateProductCandidateSelect(selectButton);
    }
  });

  document.addEventListener("change", (event) => {
    const select = event.target.closest("#affiliateProductCommissionType");
    if (!select) return;
    const form = select.closest("[data-admin-affiliate-product-form]");
    if (form) toggleAffiliateProductCommissionTypeFields(form);
  });

  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-affiliate-product-form]");
    if (!form) return;
    event.preventDefault();
    handleAdminAffiliateProductFormSubmit(form);
  });
}

function setupAdminAffiliateProductSettingActions() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="remove-affiliate-product"]');
    if (!button) return;
    handleRemoveAffiliateProduct(button);
  });
}

async function handleRemoveAffiliateProduct(button) {
  const productName = button.dataset.productName || "this product";
  const confirmed = window.confirm(`Remove "${productName}" from the Affiliate Programme?\nThis does not affect any historical commission already earned on it.`);
  if (!confirmed) return;

  const id = button.dataset.affiliateProductId;
  const row = button.closest("[data-affiliate-product-row]");
  const banner = document.querySelector("[data-admin-affiliate-product-banner]");
  const rowButtons = row?.querySelectorAll("button") || [];

  rowButtons.forEach((btn) => (btn.disabled = true));
  if (banner) banner.hidden = true;

  try {
    await deleteAdminAffiliateProductSetting(id);
    setPendingAdminMessage("Product removed from the Affiliate Programme.");
    rerenderCurrentRoute();
  } catch (error) {
    rowButtons.forEach((btn) => (btn.disabled = false));
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  }
}

// Version 7, Milestone 176: admin affiliate application review actions
// — approve/reject/request-correction (each reuses the existing
// referral-affiliate lifecycle server-side, see
// adminAffiliateApplication.service.ts), reveal the masked identity
// number, and view a document via a fresh signed URL. Every decision
// button lives on the detail page only, so there's no "row" to disable
// buttons within — the whole decision card is disabled instead.
function setupAdminAffiliateApplicationActions() {
  document.addEventListener("click", (event) => {
    const approveButton = event.target.closest('[data-action="approve-affiliate-application"]');
    if (approveButton) {
      handleAdminAffiliateApplicationDecision(approveButton, () => approveAdminAffiliateApplication(approveButton.dataset.applicationId), "approved");
      return;
    }

    const rejectButton = event.target.closest('[data-action="reject-affiliate-application"]');
    if (rejectButton) {
      const reason = document.getElementById("decisionReason")?.value.trim() || "";
      if (!reason) {
        showAdminAffiliateApplicationDecisionError("A reason is required to reject an application.");
        return;
      }
      handleAdminAffiliateApplicationDecision(rejectButton, () => rejectAdminAffiliateApplication(rejectButton.dataset.applicationId, reason), "rejected");
      return;
    }

    const correctionButton = event.target.closest('[data-action="request-affiliate-application-correction"]');
    if (correctionButton) {
      const reason = document.getElementById("decisionReason")?.value.trim() || "";
      const area = document.getElementById("correctionArea")?.value || "OTHER";
      if (!reason) {
        showAdminAffiliateApplicationDecisionError("A reason is required to request a correction.");
        return;
      }
      handleAdminAffiliateApplicationDecision(correctionButton, () => requestAdminAffiliateApplicationCorrection(correctionButton.dataset.applicationId, { reason, area }), "sent back for correction");
      return;
    }

    const revealButton = event.target.closest('[data-action="reveal-identity-number"]');
    if (revealButton) {
      handleRevealAffiliateIdentityNumber(revealButton);
      return;
    }

    const viewDocButton = event.target.closest('[data-action="view-affiliate-document"]');
    if (viewDocButton) {
      handleViewAffiliateDocument(viewDocButton);
    }
  });
}

function showAdminAffiliateApplicationDecisionError(message) {
  const banner = document.querySelector("[data-affiliate-application-decision-banner]");
  if (banner) {
    banner.textContent = message;
    banner.hidden = false;
  }
}

async function handleAdminAffiliateApplicationDecision(button, apiCall, verb) {
  const card = button.closest(".order-confirmation__card");
  const banner = document.querySelector("[data-affiliate-application-decision-banner]");
  const buttons = card?.querySelectorAll("button") || [];

  buttons.forEach((btn) => (btn.disabled = true));
  if (banner) banner.hidden = true;

  try {
    await apiCall();
    setPendingAdminMessage(`Application ${verb}.`);
    rerenderCurrentRoute();
  } catch (error) {
    buttons.forEach((btn) => (btn.disabled = false));
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  }
}

async function handleRevealAffiliateIdentityNumber(button) {
  button.disabled = true;
  try {
    const response = await revealAdminAffiliateApplicationIdentityNumber(button.dataset.applicationId);
    const valueEl = document.querySelector("[data-identity-number-value]");
    if (valueEl) valueEl.textContent = response.data.identityNumber || "N/A";
    button.remove();
  } catch (error) {
    button.disabled = false;
    window.alert(error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.");
  }
}

// Opens the document in a new tab via a freshly-generated, short-lived
// signed URL — never a stored/cached link (brief section 35).
async function handleViewAffiliateDocument(button) {
  const banner = document.querySelector("[data-affiliate-document-view-banner]");
  if (banner) banner.hidden = true;
  button.disabled = true;

  try {
    const response = await getAdminAffiliateApplicationDocumentSignedUrl(button.dataset.applicationId, button.dataset.documentId);
    window.open(response.data.signedUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  } finally {
    button.disabled = false;
  }
}

function setupAdminReferralSettingsForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-referral-settings-form]");
    if (!form) return;

    event.preventDefault();
    handleAdminReferralSettingsFormSubmit(form);
  });
}

function readAdminReferralSettingsFormValues(form) {
  return {
    defaultCommissionRate: Number(form.querySelector("#referralSettingsCommissionRate")?.value),
    defaultReferralDiscountRate: Number(form.querySelector("#referralSettingsDiscountRate")?.value),
    attributionWindowDays: Number(form.querySelector("#referralSettingsAttributionWindow")?.value),
    commissionValidationDays: Number(form.querySelector("#referralSettingsValidationDays")?.value),
    minimumPayoutAmount: Number(form.querySelector("#referralSettingsMinimumPayout")?.value),
    payoutDayOfMonth: Number(form.querySelector("#referralSettingsPayoutDay")?.value),
    isProgrammeActive: form.querySelector("#referralSettingsProgrammeActive")?.checked ?? true,
  };
}

// Client-side validation is a UX convenience only — the backend
// (referralProgrammeSettings.service.ts) independently re-validates
// every field regardless and remains the final authority.
function validateAdminReferralSettingsForm(values) {
  if (!Number.isFinite(values.defaultCommissionRate) || values.defaultCommissionRate < 0 || values.defaultCommissionRate > 50) return "Default commission rate must be a number between 0 and 50.";
  if (!Number.isFinite(values.defaultReferralDiscountRate) || values.defaultReferralDiscountRate < 0 || values.defaultReferralDiscountRate > 50) return "Default referral discount must be a number between 0 and 50.";
  if (!Number.isInteger(values.attributionWindowDays) || values.attributionWindowDays < 1 || values.attributionWindowDays > 365) return "Attribution window must be a whole number of days between 1 and 365.";
  if (!Number.isInteger(values.commissionValidationDays) || values.commissionValidationDays < 0 || values.commissionValidationDays > 365) return "Commission validation period must be a whole number of days between 0 and 365.";
  if (!Number.isFinite(values.minimumPayoutAmount) || values.minimumPayoutAmount < 0) return "Minimum payout amount must be a non-negative number.";
  if (!Number.isInteger(values.payoutDayOfMonth) || values.payoutDayOfMonth < 1 || values.payoutDayOfMonth > 28) return "Payout day of month must be a whole number between 1 and 28.";
  return null;
}

async function handleAdminReferralSettingsFormSubmit(form) {
  const banner = form.querySelector("[data-admin-referral-settings-banner]");
  const submitButton = form.querySelector('button[type="submit"]');

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  const values = readAdminReferralSettingsFormValues(form);
  const validationError = validateAdminReferralSettingsForm(values);
  if (validationError) {
    if (banner) {
      banner.textContent = validationError;
      banner.hidden = false;
    }
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    await updateReferralSettings(values);
    setPendingAdminMessage("Referral programme settings updated successfully.");
    rerenderCurrentRoute();
  } catch (error) {
    let message = "Something went wrong. Please try again shortly.";
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    } else if (error instanceof ApiError && error.status === 400) {
      message = error.message;
    } else if (error instanceof ApiUnavailableError) {
      message = "We could not connect to the admin system right now. Please try again shortly.";
    }

    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Commission lifecycle + payout (Version 7, Milestone 172B.5). Every
// eligibility/threshold/status decision is made server-side
// (referralCommission.service.ts) — these handlers only relay the
// admin's action and display whatever the backend decides.
// ---------------------------------------------------------------------------

function setupAdminCommissionFilterForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-commission-filter-form]");
    if (!form) return;

    event.preventDefault();

    const status = form.querySelector('select[name="status"]')?.value || "";
    const eligibleOnly = form.querySelector('input[name="eligibleOnly"]')?.checked || false;
    const affiliateId = form.querySelector('input[name="affiliateId"]')?.value || "";

    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (eligibleOnly) params.set("eligibleOnly", "true");
    if (affiliateId) params.set("affiliateId", affiliateId);
    params.set("page", "1");

    navigateTo(`/admin/referrals/commissions?${params.toString()}`);
  });
}

function setupAdminCommissionActions() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="approve-commission"]');
    if (!button) return;
    handleApproveCommission(button);
  });
}

async function handleApproveCommission(button) {
  const commissionId = button.dataset.commissionId;
  const banner = document.querySelector("[data-admin-commission-banner]") || document.querySelector("[data-admin-commission-detail-banner]");

  button.disabled = true;
  if (banner) banner.hidden = true;

  try {
    await approveAdminReferralCommission(commissionId);
    setPendingAdminMessage("Commission approved.");
    rerenderCurrentRoute();
  } catch (error) {
    button.disabled = false;
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  }
}

function setupAdminCommissionReverseForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-commission-reverse-form]");
    if (!form) return;

    event.preventDefault();
    handleReverseCommission(form);
  });
}

async function handleReverseCommission(form) {
  const commissionId = form.dataset.commissionId;
  const banner = document.querySelector("[data-admin-commission-detail-banner]");
  const submitButton = form.querySelector('button[type="submit"]');
  const reason = form.querySelector('textarea[name="reason"]')?.value.trim() || "";
  const confirmClawback = form.querySelector('input[name="confirmClawback"]')?.checked ?? false;

  if (banner) banner.hidden = true;
  if (!reason || reason.length < 3) {
    if (banner) {
      banner.textContent = "A reversal reason of at least 3 characters is required.";
      banner.hidden = false;
    }
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    await reverseAdminReferralCommission(commissionId, { reason, confirmClawback });
    setPendingAdminMessage("Commission reversed.");
    rerenderCurrentRoute();
  } catch (error) {
    if (submitButton) submitButton.disabled = false;
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  }
}

function setupAdminPayoutActions() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="pay-affiliate-commissions"]');
    if (!button) return;
    handlePayAffiliateCommissions(button);
  });
}

async function handlePayAffiliateCommissions(button) {
  const affiliateId = button.dataset.affiliateId;
  const affiliateName = button.dataset.affiliateName || "this affiliate";
  const balance = button.dataset.balance;
  const banner = document.querySelector("[data-admin-payout-banner]");

  // A real, off-platform payment already happened before this button is
  // ever clicked — this confirmation exists so an admin can't mark a
  // payout paid by mis-click; it never sends any money itself.
  const confirmed = window.confirm(`Confirm that you have already paid ${affiliateName} R${balance} for real, outside this system. This will mark their approved commissions as PAID.`);
  if (!confirmed) return;

  button.disabled = true;
  if (banner) banner.hidden = true;

  try {
    await payAdminAffiliateCommissions(affiliateId);
    setPendingAdminMessage(`Marked R${balance} paid to ${affiliateName}.`);
    rerenderCurrentRoute();
  } catch (error) {
    button.disabled = false;
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Manual payment confirmation (Version 7, Milestone 172B.6) — Bank
// Transfer/Cash on Delivery only, never PayFast. §27 of the brief:
// "Require confirmation modal. Clearly identify: payment method, order
// number, amount expected." Same window.confirm() pattern as the
// payout "Mark Paid" action above.
// ---------------------------------------------------------------------------

function setupAdminPaymentConfirmation() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="confirm-manual-payment"]');
    if (!button) return;
    handleConfirmManualPayment(button);
  });
}

async function handleConfirmManualPayment(button) {
  const orderNumber = button.dataset.orderNumber;
  const paymentMethod = button.dataset.paymentMethod;
  const amount = button.dataset.amount;

  const confirmed = window.confirm(
    `Confirm you have genuinely received payment for order ${orderNumber}.\n\nPayment method: ${paymentMethod}\nAmount expected: R${amount}\n\nThis will mark the order's payment as PAID.`
  );
  if (!confirmed) return;

  button.disabled = true;

  try {
    await confirmAdminManualPayment(orderNumber);
    setPendingAdminMessage("Payment confirmed as received.");
    rerenderCurrentRoute();
  } catch (error) {
    button.disabled = false;
    window.alert(error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.");
  }
}

// ---------------------------------------------------------------------------
// Content Studio Phase 2: Brand Knowledge Foundation. Same filter-form /
// create-or-edit-form / row-action three-part shape as the referral
// affiliate handlers above, repeated once per entity (Brand Knowledge,
// Content Pillars, Audiences). No campaign/generation/publishing
// handler exists anywhere in this file — Phase 2 is Brand Knowledge
// only.
// ---------------------------------------------------------------------------

function setupAdminBrandKnowledgeFilterForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-brand-knowledge-filter-form]");
    if (!form) return;
    event.preventDefault();

    const search = form.querySelector('input[name="search"]')?.value.trim() || "";
    const category = form.querySelector('select[name="category"]')?.value || "";
    const tag = form.querySelector('input[name="tag"]')?.value.trim() || "";
    const isActive = form.querySelector('select[name="isActive"]')?.value || "";

    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (tag) params.set("tag", tag);
    if (isActive) params.set("isActive", isActive);
    params.set("page", "1");

    navigateTo(`/admin/content-studio?${params.toString()}`);
  });
}

function readAdminBrandKnowledgeFormValues(form) {
  const title = form.querySelector("#entryTitle")?.value.trim() || "";
  const body = form.querySelector("#entryBody")?.value.trim() || "";
  const category = form.querySelector("#entryCategory")?.value || "";
  const sourceType = form.querySelector("#entrySourceType")?.value || "";
  const tagsRaw = form.querySelector("#entryTags")?.value || "";
  const pillarId = form.querySelector("#entryPillar")?.value || "";
  const audienceId = form.querySelector("#entryAudience")?.value || "";
  const relatedProductId = form.querySelector("#entryRelatedProductId")?.value.trim() || "";
  const sourceReference = form.querySelector("#entrySourceReference")?.value.trim() || "";

  return {
    title,
    body,
    category,
    sourceType,
    tags: tagsRaw
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
    pillarId: pillarId || null,
    audienceId: audienceId || null,
    relatedProductId: relatedProductId || null,
    sourceReference: sourceReference || null,
  };
}

function validateAdminBrandKnowledgeForm(values) {
  if (!values.title) return "Title is required.";
  if (!values.body) return "Body is required.";
  if (!values.category) return "Category is required.";
  if (!values.sourceType) return "Source is required.";
  return null;
}

function setupAdminBrandKnowledgeForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-brand-knowledge-form]");
    if (!form) return;
    event.preventDefault();
    handleAdminBrandKnowledgeFormSubmit(form);
  });
}

async function handleAdminBrandKnowledgeFormSubmit(form) {
  const mode = form.dataset.mode;
  const banner = form.querySelector("[data-admin-brand-knowledge-form-banner]");
  const submitButton = form.querySelector('button[type="submit"]');

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  const values = readAdminBrandKnowledgeFormValues(form);
  const validationError = validateAdminBrandKnowledgeForm(values);
  if (validationError) {
    if (banner) {
      banner.textContent = validationError;
      banner.hidden = false;
    }
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    if (mode === "create") {
      const response = await createAdminBrandKnowledgeEntry(values);
      setPendingAdminMessage(`Brand knowledge entry "${response.data.title}" created successfully.`);
      navigateTo(`/admin/content-studio/brand-knowledge/${encodeURIComponent(response.data.id)}/edit`);
    } else {
      const entryId = form.dataset.entryId;
      await updateAdminBrandKnowledgeEntry(entryId, values);
      setPendingAdminMessage("Brand knowledge entry updated successfully.");
      rerenderCurrentRoute();
    }
  } catch (error) {
    let message = "Something went wrong. Please try again shortly.";
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    } else if (error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 409)) {
      message = error.message;
    } else if (error instanceof ApiUnavailableError) {
      message = "We could not connect to the admin system right now. Please try again shortly.";
    }
    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

const ADMIN_BRAND_KNOWLEDGE_ACTIONS = {
  "deactivate-entry": { apiCall: deactivateAdminBrandKnowledgeEntry, verb: "deactivated" },
  "reactivate-entry": { apiCall: reactivateAdminBrandKnowledgeEntry, verb: "reactivated" },
};

function setupAdminBrandKnowledgeActions() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = ADMIN_BRAND_KNOWLEDGE_ACTIONS[button.dataset.action];
    if (!action) return;
    handleAdminBrandKnowledgeAction(button, action.apiCall, action.verb);
  });
}

async function handleAdminBrandKnowledgeAction(button, apiCall, verb) {
  const entryId = button.dataset.entryId;
  const row = button.closest("[data-entry-row]");
  const banner = document.querySelector("[data-admin-brand-knowledge-banner]");
  const rowButtons = row?.querySelectorAll("button") || [];

  rowButtons.forEach((btn) => (btn.disabled = true));
  if (banner) banner.hidden = true;

  try {
    await apiCall(entryId);
    setPendingAdminMessage(`Brand knowledge entry ${verb}.`);
    rerenderCurrentRoute();
  } catch (error) {
    rowButtons.forEach((btn) => (btn.disabled = false));
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  }
}

function setupAdminContentPillarFilterForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-content-pillar-filter-form]");
    if (!form) return;
    event.preventDefault();

    const search = form.querySelector('input[name="search"]')?.value.trim() || "";
    const isActive = form.querySelector('select[name="isActive"]')?.value || "";

    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (isActive) params.set("isActive", isActive);

    navigateTo(`/admin/content-studio/pillars?${params.toString()}`);
  });
}

function readAdminContentPillarFormValues(form) {
  const name = form.querySelector("#pillarName")?.value.trim() || "";
  const description = form.querySelector("#pillarDescription")?.value.trim() || "";
  const sortOrderRaw = form.querySelector("#pillarSortOrder")?.value;

  return {
    name,
    description: description || null,
    sortOrder: sortOrderRaw ? Number(sortOrderRaw) : 0,
  };
}

function setupAdminContentPillarForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-content-pillar-form]");
    if (!form) return;
    event.preventDefault();
    handleAdminContentPillarFormSubmit(form);
  });
}

async function handleAdminContentPillarFormSubmit(form) {
  const mode = form.dataset.mode;
  const banner = form.querySelector("[data-admin-content-pillar-form-banner]");
  const submitButton = form.querySelector('button[type="submit"]');

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  const values = readAdminContentPillarFormValues(form);
  if (!values.name) {
    if (banner) {
      banner.textContent = "Name is required.";
      banner.hidden = false;
    }
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    if (mode === "create") {
      const response = await createAdminContentPillar(values);
      setPendingAdminMessage(`Content pillar "${response.data.name}" created successfully.`);
      navigateTo(`/admin/content-studio/pillars/${encodeURIComponent(response.data.id)}/edit`);
    } else {
      const pillarId = form.dataset.pillarId;
      await updateAdminContentPillar(pillarId, values);
      setPendingAdminMessage("Content pillar updated successfully.");
      rerenderCurrentRoute();
    }
  } catch (error) {
    let message = "Something went wrong. Please try again shortly.";
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    } else if (error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 409)) {
      message = error.message;
    } else if (error instanceof ApiUnavailableError) {
      message = "We could not connect to the admin system right now. Please try again shortly.";
    }
    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

const ADMIN_CONTENT_PILLAR_ACTIONS = {
  "deactivate-pillar": { apiCall: deactivateAdminContentPillar, verb: "deactivated" },
  "reactivate-pillar": { apiCall: reactivateAdminContentPillar, verb: "reactivated" },
};

function setupAdminContentPillarActions() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = ADMIN_CONTENT_PILLAR_ACTIONS[button.dataset.action];
    if (!action) return;
    handleAdminContentPillarAction(button, action.apiCall, action.verb);
  });
}

async function handleAdminContentPillarAction(button, apiCall, verb) {
  const pillarId = button.dataset.pillarId;
  const row = button.closest("[data-pillar-row]");
  const banner = document.querySelector("[data-admin-content-pillar-banner]");
  const rowButtons = row?.querySelectorAll("button") || [];

  rowButtons.forEach((btn) => (btn.disabled = true));
  if (banner) banner.hidden = true;

  try {
    await apiCall(pillarId);
    setPendingAdminMessage(`Content pillar ${verb}.`);
    rerenderCurrentRoute();
  } catch (error) {
    rowButtons.forEach((btn) => (btn.disabled = false));
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  }
}

function setupAdminAudienceFilterForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-audience-filter-form]");
    if (!form) return;
    event.preventDefault();

    const search = form.querySelector('input[name="search"]')?.value.trim() || "";
    const isActive = form.querySelector('select[name="isActive"]')?.value || "";

    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (isActive) params.set("isActive", isActive);

    navigateTo(`/admin/content-studio/audiences?${params.toString()}`);
  });
}

function readAdminAudienceFormValues(form) {
  const name = form.querySelector("#audienceName")?.value.trim() || "";
  const description = form.querySelector("#audienceDescription")?.value.trim() || "";
  const painPoints = form.querySelector("#audiencePainPoints")?.value.trim() || "";
  const motivations = form.querySelector("#audienceMotivations")?.value.trim() || "";
  const preferredContent = form.querySelector("#audiencePreferredContent")?.value.trim() || "";

  return {
    name,
    description: description || null,
    painPoints: painPoints || null,
    motivations: motivations || null,
    preferredContent: preferredContent || null,
  };
}

function setupAdminAudienceForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-audience-form]");
    if (!form) return;
    event.preventDefault();
    handleAdminAudienceFormSubmit(form);
  });
}

async function handleAdminAudienceFormSubmit(form) {
  const mode = form.dataset.mode;
  const banner = form.querySelector("[data-admin-audience-form-banner]");
  const submitButton = form.querySelector('button[type="submit"]');

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  const values = readAdminAudienceFormValues(form);
  if (!values.name) {
    if (banner) {
      banner.textContent = "Name is required.";
      banner.hidden = false;
    }
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    if (mode === "create") {
      const response = await createAdminAudience(values);
      setPendingAdminMessage(`Audience "${response.data.name}" created successfully.`);
      navigateTo(`/admin/content-studio/audiences/${encodeURIComponent(response.data.id)}/edit`);
    } else {
      const audienceId = form.dataset.audienceId;
      await updateAdminAudience(audienceId, values);
      setPendingAdminMessage("Audience updated successfully.");
      rerenderCurrentRoute();
    }
  } catch (error) {
    let message = "Something went wrong. Please try again shortly.";
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    } else if (error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 409)) {
      message = error.message;
    } else if (error instanceof ApiUnavailableError) {
      message = "We could not connect to the admin system right now. Please try again shortly.";
    }
    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

const ADMIN_AUDIENCE_ACTIONS = {
  "deactivate-audience": { apiCall: deactivateAdminAudience, verb: "deactivated" },
  "reactivate-audience": { apiCall: reactivateAdminAudience, verb: "reactivated" },
};

function setupAdminAudienceActions() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = ADMIN_AUDIENCE_ACTIONS[button.dataset.action];
    if (!action) return;
    handleAdminAudienceAction(button, action.apiCall, action.verb);
  });
}

async function handleAdminAudienceAction(button, apiCall, verb) {
  const audienceId = button.dataset.audienceId;
  const row = button.closest("[data-audience-row]");
  const banner = document.querySelector("[data-admin-audience-banner]");
  const rowButtons = row?.querySelectorAll("button") || [];

  rowButtons.forEach((btn) => (btn.disabled = true));
  if (banner) banner.hidden = true;

  try {
    await apiCall(audienceId);
    setPendingAdminMessage(`Audience ${verb}.`);
    rerenderCurrentRoute();
  } catch (error) {
    rowButtons.forEach((btn) => (btn.disabled = false));
    if (banner) {
      banner.textContent = error instanceof ApiError ? error.message : "Something went wrong. Please try again shortly.";
      banner.hidden = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Content Studio Phase 3A: AI context preview. Fetches and renders the
// structured context assembled by buildContentContext() in place, no
// page navigation — the same "submit, then render results into a
// container div" shape a live search page would use. This never calls
// anything that generates content; previewContentContext() only ever
// hits the read-only /context-preview endpoint.
// ---------------------------------------------------------------------------

function setupAdminContextPreviewForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-context-preview-form]");
    if (!form) return;
    event.preventDefault();
    handleAdminContextPreviewSubmit(form);
  });
}

async function handleAdminContextPreviewSubmit(form) {
  const banner = form.querySelector("[data-admin-context-preview-banner]");
  const resultsContainer = document.querySelector("[data-admin-context-preview-results]");
  const submitButton = form.querySelector('button[type="submit"]');

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }
  if (resultsContainer) resultsContainer.innerHTML = "";

  const productId = form.querySelector("#contextPreviewProduct")?.value || undefined;
  const audienceId = form.querySelector("#contextPreviewAudience")?.value || undefined;
  const pillarId = form.querySelector("#contextPreviewPillar")?.value || undefined;
  const platforms = Array.from(form.querySelectorAll('input[name="contextPreviewPlatform"]:checked')).map((input) => input.value);

  if (submitButton) submitButton.disabled = true;

  try {
    const response = await previewContentContext({ productId, audienceId, pillarId, platforms });
    if (resultsContainer) resultsContainer.innerHTML = renderContextPreviewResult(response.data);
  } catch (error) {
    let message = "Something went wrong. Please try again shortly.";
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    } else if (error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 409)) {
      message = error.message;
    } else if (error instanceof ApiUnavailableError) {
      message = "We could not connect to the admin system right now. Please try again shortly.";
    }
    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// 503 is deliberately never shown to the admin verbatim — the backend
// message ("Product image upload is not configured.") is accurate but
// technical; this is the one error this milestone was explicitly asked
// to translate into a clear, non-scary sentence.
function friendlyAdminImageErrorMessage(error) {
  if (error instanceof ApiError && error.status === 503) {
    return "Image upload is not configured yet. Please finish Supabase Storage setup first.";
  }
  if (error instanceof ApiError && (error.status === 400 || error.status === 404)) {
    return error.message;
  }
  if (error instanceof ApiUnavailableError) {
    return "We could not connect to the admin system right now. Please try again shortly.";
  }
  return "Something went wrong. Please try again shortly.";
}

function getAdminImagesProductId(el) {
  return el.closest("[data-admin-product-images]")?.dataset.productId;
}

const ADMIN_IMAGE_UPLOAD_BUTTON_DEFAULT_TEXT = "Upload Image";
const ADMIN_IMAGE_UPLOAD_BUTTON_UPLOADING_TEXT = "Uploading image...";

// Milestone 71's live test uploaded the same image twice — the
// button's own `disabled` attribute was set, but nothing stopped a
// second submit (a fast double click/tap, or Enter in a text field)
// from re-entering this handler while the first upload's request was
// still in flight, since the function never checked for that before
// doing any work. `form.dataset.uploading` is the actual guard now;
// disabling every field is the visible half of the same fix.
function setAdminImageUploadFormBusy(form, busy) {
  const submitButton = form.querySelector('button[type="submit"]');
  const fileInput = form.querySelector("#productImageFile");
  const altTextInput = form.querySelector("#productImageAltText");
  const kindInputs = form.querySelectorAll('input[name="productImageKind"]');

  form.dataset.uploading = busy ? "true" : "false";
  if (submitButton) {
    submitButton.disabled = busy;
    submitButton.textContent = busy ? ADMIN_IMAGE_UPLOAD_BUTTON_UPLOADING_TEXT : ADMIN_IMAGE_UPLOAD_BUTTON_DEFAULT_TEXT;
  }
  if (fileInput) fileInput.disabled = busy;
  if (altTextInput) altTextInput.disabled = busy;
  kindInputs.forEach((input) => {
    input.disabled = busy;
  });
}

async function handleAdminImageUploadSubmit(form) {
  // Re-entrancy guard — see setAdminImageUploadFormBusy's comment.
  // Checked before anything else, including validation, so a queued
  // duplicate submit is a true no-op rather than a second validation
  // pass that happens to also pass.
  if (form.dataset.uploading === "true") {
    return;
  }

  const productId = form.dataset.productId;
  const banner = form.querySelector("[data-admin-image-upload-banner]");
  const fileInput = form.querySelector("#productImageFile");
  const altTextInput = form.querySelector("#productImageAltText");
  const kindInput = form.querySelector('input[name="productImageKind"]:checked');

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  const file = fileInput?.files?.[0];
  const altText = altTextInput?.value.trim() || "";
  const kind = kindInput?.value || "gallery";

  // Client-side validation is a UX convenience only, mirroring
  // adminProductImage.service.ts — the backend remains the final
  // authority regardless of what passes here.
  let validationError = null;
  if (!file) {
    validationError = "An image file is required.";
  } else if (!ALLOWED_ADMIN_IMAGE_MIME_TYPES.includes(file.type)) {
    validationError = "Unsupported image type. Allowed types: JPG, PNG, or WebP.";
  } else if (file.size > MAX_ADMIN_IMAGE_FILE_SIZE_BYTES) {
    validationError = "Image file is too large. Maximum size is 5 MB.";
  } else if (!altText) {
    validationError = "Alt text is required.";
  }

  if (validationError) {
    if (banner) {
      banner.textContent = validationError;
      banner.hidden = false;
    }
    return;
  }

  setAdminImageUploadFormBusy(form, true);

  try {
    await uploadProductImage(productId, file, altText, kind);
    // Success re-renders the whole edit page (setPendingAdminMessage +
    // rerenderCurrentRoute, the same pattern already proven for the
    // product save form and set-primary/alt-text actions above) — the
    // old form element is discarded entirely, which is what clears the
    // selected file and alt text and reloads the images list in one
    // step, more reliably than trying to hand-reset individual fields
    // on a form that's about to be thrown away anyway.
    setPendingAdminMessage("Image uploaded successfully.");
    rerenderCurrentRoute();
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    }
    if (banner) {
      banner.textContent = friendlyAdminImageErrorMessage(error);
      banner.hidden = false;
    }
    // Only re-enable on failure — on success the form is about to be
    // replaced by rerenderCurrentRoute(), so re-enabling it here would
    // just be a wasted, briefly-visible flicker before it's discarded.
    setAdminImageUploadFormBusy(form, false);
  }
}

async function handleAdminImageSetPrimary(button) {
  const card = button.closest("[data-admin-image-card]");
  const imageId = card?.dataset.adminImageCard;
  const productId = getAdminImagesProductId(button);
  if (!card || !imageId || !productId) return;

  button.disabled = true;

  try {
    await updateProductImage(productId, imageId, { isPrimary: true });
    setPendingAdminMessage("Main image updated.");
    rerenderCurrentRoute();
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    }
    button.disabled = false;
    // No dedicated banner for this action — a browser alert is enough
    // for this first version's rarely-hit error path (e.g. the image
    // was removed by someone else in the meantime).
    window.alert(friendlyAdminImageErrorMessage(error));
  }
}

async function handleAdminImageAltSubmit(form) {
  const card = form.closest("[data-admin-image-card]");
  const imageId = card?.dataset.adminImageCard;
  const productId = getAdminImagesProductId(form);
  const input = form.querySelector("[data-admin-image-alt-input]");
  const submitButton = form.querySelector('button[type="submit"]');
  if (!card || !imageId || !productId) return;

  const altText = input?.value.trim() || "";
  if (!altText) {
    window.alert("Alt text is required.");
    return;
  }

  if (submitButton) submitButton.disabled = true;

  try {
    await updateProductImage(productId, imageId, { altText });
    setPendingAdminMessage("Image alt text updated.");
    rerenderCurrentRoute();
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    }
    window.alert(friendlyAdminImageErrorMessage(error));
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

// Version 7, Milestone 74. Single-image delete only — there is no
// bulk-remove action anywhere. A plain confirm() dialog is enough for
// this first version's one destructive action; it blocks the click
// from doing anything until the admin explicitly confirms.
async function handleAdminImageRemove(button) {
  const card = button.closest("[data-admin-image-card]");
  const imageId = card?.dataset.adminImageCard;
  const productId = getAdminImagesProductId(button);
  if (!card || !imageId || !productId) return;

  const confirmed = window.confirm("Remove this image from this product?\nThis cannot be undone.");
  if (!confirmed) return;

  button.disabled = true;

  try {
    await deleteProductImage(productId, imageId);
    setPendingAdminMessage("Image removed successfully.");
    rerenderCurrentRoute();
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    }
    // Re-enable on failure — the image card is left exactly as it was,
    // never partially removed from the visible list, since nothing
    // here touches the DOM until the API call actually succeeds.
    button.disabled = false;
    window.alert(friendlyAdminImageErrorMessage(error));
  }
}

// Admin digital-asset (file) upload for DIGITAL products (Version 7,
// Milestone 152). Same "re-render the whole edit page on success"
// pattern as product images above — one file per product, so upload
// always means "upload or replace", never a list to manage.
const MAX_ADMIN_DIGITAL_ASSET_FILE_SIZE_BYTES = 50 * 1024 * 1024; // kept in sync with adminDigitalAsset.service.ts and the Supabase bucket's own 50 MB limit
const ALLOWED_ADMIN_DIGITAL_ASSET_MIME_TYPES = ["application/pdf", "application/zip", "application/x-zip-compressed"];

function friendlyAdminDigitalAssetErrorMessage(error) {
  if (error instanceof ApiError && error.status === 503) {
    return "Digital file upload is not configured yet. Please finish Supabase Storage setup first.";
  }
  if (error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 409)) {
    return error.message;
  }
  if (error instanceof ApiUnavailableError) {
    return "We could not connect to the admin system right now. Please try again shortly.";
  }
  return "Something went wrong. Please try again shortly.";
}

function setupAdminDigitalAsset() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-digital-asset-upload-form]");
    if (!form) return;
    event.preventDefault();
    handleAdminDigitalAssetUploadSubmit(form);
  });

  document.addEventListener("change", (event) => {
    if (!event.target.matches("#digitalAssetFile")) return;
    const form = event.target.closest("[data-admin-digital-asset-upload-form]");
    const label = form?.querySelector("[data-admin-digital-asset-filename]");
    if (label) label.textContent = event.target.files?.[0]?.name || "";
  });

  document.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-admin-digital-asset-remove]");
    if (removeButton) handleAdminDigitalAssetRemove(removeButton);
  });
}

async function handleAdminDigitalAssetUploadSubmit(form) {
  if (form.dataset.uploading === "true") return;

  const productId = form.dataset.productId;
  const banner = form.querySelector("[data-admin-digital-asset-upload-banner]");
  const fileInput = form.querySelector("#digitalAssetFile");
  const displayNameInput = form.querySelector("#digitalAssetDisplayName");
  const pageCountInput = form.querySelector("#digitalAssetPageCount");
  const versionInput = form.querySelector("#digitalAssetVersion");

  if (banner) {
    banner.hidden = true;
    banner.textContent = "";
  }

  const file = fileInput?.files?.[0];
  const displayName = displayNameInput?.value.trim() || "";
  const pageCount = pageCountInput?.value ? Number(pageCountInput.value) : undefined;
  const version = versionInput?.value.trim() || "";

  // Client-side validation is a UX convenience only, mirroring
  // adminDigitalAsset.service.ts — the backend remains the final
  // authority regardless of what passes here.
  let validationError = null;
  if (!file) {
    validationError = "A file is required.";
  } else if (!ALLOWED_ADMIN_DIGITAL_ASSET_MIME_TYPES.includes(file.type)) {
    validationError = "Unsupported file type. Allowed types: PDF, ZIP.";
  } else if (file.size > MAX_ADMIN_DIGITAL_ASSET_FILE_SIZE_BYTES) {
    validationError = "File is too large. Maximum size is 50 MB.";
  } else if (!displayName) {
    validationError = "File display name is required.";
  }

  if (validationError) {
    if (banner) {
      banner.textContent = validationError;
      banner.hidden = false;
    }
    return;
  }

  form.dataset.uploading = "true";
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Uploading file...";
  }

  try {
    await uploadAdminDigitalAsset(productId, file, { displayName, pageCount, version });
    setPendingAdminMessage("Digital file uploaded successfully.");
    rerenderCurrentRoute();
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    }
    if (banner) {
      banner.textContent = friendlyAdminDigitalAssetErrorMessage(error);
      banner.hidden = false;
    }
    form.dataset.uploading = "false";
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Upload File";
    }
  }
}

async function handleAdminDigitalAssetRemove(button) {
  const section = button.closest("[data-admin-digital-asset-section]");
  const productId = section?.dataset.productId;
  if (!productId) return;

  const confirmed = window.confirm("Remove this digital file from this product?\nThis cannot be undone. The product must not be Active while it has no file.");
  if (!confirmed) return;

  button.disabled = true;

  try {
    await deleteAdminDigitalAsset(productId);
    setPendingAdminMessage("Digital file removed successfully.");
    rerenderCurrentRoute();
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return;
    }
    button.disabled = false;
    window.alert(friendlyAdminDigitalAssetErrorMessage(error));
  }
}

// Contact/Schools/Wholesale/Distributor forms (see
// components/enquiryForm.js) share one ".demo-form" class (kept for
// its existing CSS/behaviour hooks, even though the form itself is no
// longer a demo) and each carries data-enquiry-type ("CONTACT" /
// "SCHOOL" / "WHOLESALE" / "DISTRIBUTOR") so this one delegated
// handler can submit any of them to POST /api/enquiries.
function setupEnquiryForms() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest(".demo-form");
    if (!form) return;

    event.preventDefault();
    handleEnquirySubmit(form);
  });

  document.addEventListener("input", (event) => {
    const form = event.target.closest(".demo-form");
    if (!form || !event.target.name) return;
    clearFieldError(form, event.target.name);
  });
}

function showEnquiryBanner(form, message) {
  const bannerEl = form.querySelector("[data-enquiry-banner]");
  if (!bannerEl) return;

  bannerEl.textContent = message;
  bannerEl.hidden = false;
}

function clearAllEnquiryErrors(form) {
  form.querySelectorAll(".form-field__error").forEach((el) => (el.textContent = ""));
  form.querySelectorAll(".has-error").forEach((el) => el.classList.remove("has-error"));
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));

  const bannerEl = form.querySelector("[data-enquiry-banner]");
  if (bannerEl) {
    bannerEl.textContent = "";
    bannerEl.hidden = true;
  }

  const resultEl = form.querySelector(".demo-form__result");
  if (resultEl) resultEl.hidden = true;
}

// Enquiry field names (type/name/email/phone/companyName/message/
// province/estimatedQuantity/...) are already flat, top-level backend
// field names — unlike the checkout form, no field-name mapping table
// is needed here.
function showEnquiryFieldErrors(form, backendErrors) {
  const fieldErrors = {};
  const unmatched = [];

  backendErrors.forEach(({ field, message }) => {
    if (form.querySelector(`[name="${field}"]`)) {
      fieldErrors[field] = message;
    } else {
      unmatched.push(message);
    }
  });

  if (Object.keys(fieldErrors).length > 0) {
    showCheckoutErrors(form, fieldErrors);
  }
  if (unmatched.length > 0) {
    showEnquiryBanner(form, unmatched.join(" "));
  }
}

async function handleEnquirySubmit(form) {
  clearAllEnquiryErrors(form);

  const type = form.dataset.enquiryType;
  const data = Object.fromEntries(new FormData(form).entries());

  const payload = {
    type,
    name: (data.name || "").trim(),
    email: (data.email || "").trim(),
    message: (data.message || "").trim(),
  };
  if ((data.companyName || "").trim()) payload.companyName = data.companyName.trim();
  if (data.estimatedQuantity) {
    const quantity = parseInt(data.estimatedQuantity, 10);
    if (Number.isInteger(quantity)) payload.estimatedQuantity = quantity;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    const response = await submitEnquiry(payload);
    const resultEl = form.querySelector(".demo-form__result");

    if (resultEl) {
      resultEl.textContent = `Thank you. Your enquiry has been received. Reference: ${response.data.id}.`;
      resultEl.hidden = false;
      resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    form.reset();
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      showEnquiryBanner(form, "We could not send your enquiry right now. Please try again shortly.");
    } else if (error instanceof ApiError && error.errors?.length) {
      showEnquiryFieldErrors(form, error.errors);
    } else if (error instanceof ApiError) {
      showEnquiryBanner(form, error.message);
    } else {
      showEnquiryBanner(form, "We could not send your enquiry right now. Please try again shortly.");
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function updateHeaderCounters() {
  const cartBadge = document.querySelector('[data-badge="cart"]');
  const wishlistBadge = document.querySelector('[data-badge="wishlist"]');

  if (cartBadge) cartBadge.textContent = getCartItemCount();
  if (wishlistBadge) wishlistBadge.textContent = getWishlistCount();
}

let toastTimer = null;

function showToast(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("is-visible");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2500);
}

// Version 7, Milestone 144: product image lightbox — a single,
// lazily-created overlay reused across every product page (same
// "create once on first use, toggle visibility" pattern as
// showToast() above), opened by clicking the product's main image —
// see productDetails.js's own [data-action="view-larger-image"]
// button for the trigger markup.
//
// Version 7, Milestone 144C: the page's gallery and the lightbox now
// share one index per product ([data-gallery]'s own data-current-
// index), read/written by setGalleryIndex() below — arrows,
// thumbnails, lightbox prev/next, lightbox keyboard nav and swipe
// gestures all move through this one function, so the underlying page
// and an open lightbox can never show two different images at once.
let lightboxTriggerEl = null;
let lightboxGalleryEl = null;

function getGalleryImages(galleryEl) {
  try {
    const parsed = JSON.parse(galleryEl.dataset.images || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getGalleryIndex(galleryEl) {
  return Number(galleryEl.dataset.currentIndex || 0);
}

function updateGalleryPageDom(galleryEl, index, images) {
  const current = images[index];
  if (!current) return;

  const mainImg = galleryEl.querySelector(".product-details__main-image");
  if (mainImg) {
    mainImg.src = current.src;
    mainImg.alt = current.alt;
    mainImg.dataset.originalSrc = current.original;
  }

  galleryEl.querySelectorAll(".product-details__thumb-btn").forEach((btn, i) => {
    const isActive = i === index;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-current", String(isActive));
  });
}

function updateLightboxImageDom(images, index) {
  const current = images[index];
  const lightbox = document.getElementById("image-lightbox");
  if (!current || !lightbox || lightbox.hidden) return;
  const img = lightbox.querySelector(".image-lightbox__image");
  img.src = current.lightboxSrc;
  img.alt = current.alt;
}

// The one place any navigation (page arrows, thumbnail click, lightbox
// prev/next, lightbox keyboard, swipe) changes which image is showing.
// Wraps around at either end rather than stopping, so arrow buttons
// never need a disabled state.
function setGalleryIndex(galleryEl, index) {
  const images = getGalleryImages(galleryEl);
  if (images.length === 0) return;
  const normalized = ((index % images.length) + images.length) % images.length;
  galleryEl.dataset.currentIndex = String(normalized);

  updateGalleryPageDom(galleryEl, normalized, images);
  if (lightboxGalleryEl === galleryEl) {
    updateLightboxImageDom(images, normalized);
  }
}

function getOrCreateLightbox() {
  let lightbox = document.getElementById("image-lightbox");
  if (lightbox) return lightbox;

  lightbox = document.createElement("div");
  lightbox.id = "image-lightbox";
  lightbox.className = "image-lightbox";
  lightbox.hidden = true;
  lightbox.innerHTML = `
    <div class="image-lightbox__dialog" role="dialog" aria-modal="true" aria-label="Larger product image">
      <button type="button" class="image-lightbox__close" data-action="close-lightbox" aria-label="Close image">
        <span aria-hidden="true">&times;</span> Close image
      </button>
      <button type="button" class="image-lightbox__nav image-lightbox__nav--prev" data-action="lightbox-prev" aria-label="Previous product image">
        <span aria-hidden="true">&lsaquo;</span>
      </button>
      <img class="image-lightbox__image" src="" alt="" />
      <button type="button" class="image-lightbox__nav image-lightbox__nav--next" data-action="lightbox-next" aria-label="Next product image">
        <span aria-hidden="true">&rsaquo;</span>
      </button>
    </div>
  `;
  document.body.appendChild(lightbox);
  return lightbox;
}

function openLightboxForGallery(galleryEl, triggerEl) {
  const images = getGalleryImages(galleryEl);
  if (images.length === 0) return;

  const lightbox = getOrCreateLightbox();
  lightboxGalleryEl = galleryEl;
  lightboxTriggerEl = triggerEl || null;

  const showNav = images.length > 1;
  lightbox.querySelectorAll(".image-lightbox__nav").forEach((btn) => {
    btn.hidden = !showNav;
  });

  // Must come before updateLightboxImageDom() below — that function
  // deliberately no-ops while the lightbox is still hidden (so
  // setGalleryIndex() calls from page-arrow navigation don't bother
  // touching an invisible lightbox), so opening it has to flip this
  // first or its very first image never gets set.
  lightbox.hidden = false;
  updateLightboxImageDom(images, getGalleryIndex(galleryEl));

  document.body.classList.add("has-lightbox-open");
  lightbox.querySelector(".image-lightbox__close").focus();
}

function closeLightbox() {
  const lightbox = document.getElementById("image-lightbox");
  if (!lightbox || lightbox.hidden) return;

  lightbox.hidden = true;
  document.body.classList.remove("has-lightbox-open");
  lightbox.querySelector(".image-lightbox__image").src = "";
  lightboxGalleryEl = null;

  if (lightboxTriggerEl) {
    lightboxTriggerEl.focus();
    lightboxTriggerEl = null;
  }
}

// Horizontal-swipe support for both the page gallery and an open
// lightbox, sharing one pair of document-level touch listeners rather
// than re-binding per render. `{ passive: true }` throughout — this
// never calls preventDefault, so native vertical scroll/pinch-zoom is
// completely unaffected; a swipe is only ever read after the fact, on
// touchend, from how far and in which direction the finger moved.
const SWIPE_THRESHOLD_PX = 40;
let swipeStartX = null;
let swipeStartY = null;
let swipeGalleryEl = null;

function resolveGalleryForSwipeContainer(container) {
  if (!container) return null;
  if (container.classList.contains("image-lightbox__dialog")) return lightboxGalleryEl;
  return container.closest("[data-gallery]");
}

function setupGallerySwipe() {
  document.addEventListener(
    "touchstart",
    (event) => {
      const container = event.target.closest(".product-details__main-wrap, .image-lightbox__dialog");
      swipeGalleryEl = resolveGalleryForSwipeContainer(container);
      if (!swipeGalleryEl) return;
      const touch = event.touches[0];
      swipeStartX = touch.clientX;
      swipeStartY = touch.clientY;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchend",
    (event) => {
      if (!swipeGalleryEl || swipeStartX === null) return;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - swipeStartX;
      const deltaY = touch.clientY - swipeStartY;

      if (Math.abs(deltaX) > SWIPE_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY)) {
        setGalleryIndex(swipeGalleryEl, getGalleryIndex(swipeGalleryEl) + (deltaX < 0 ? 1 : -1));
      }

      swipeStartX = null;
      swipeStartY = null;
      swipeGalleryEl = null;
    },
    { passive: true }
  );
}

// Deliberately no focus trap loop here — Escape, the close button and
// clicking the backdrop are enough to always get back out, and a
// hand-rolled Tab trap risks stranding keyboard users worse than not
// having one at all.
function setupProductImageLightbox() {
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest('[data-action="view-larger-image"]');
    if (trigger) {
      const galleryEl = trigger.closest("[data-gallery]");
      if (galleryEl) openLightboxForGallery(galleryEl, trigger);
      return;
    }

    const prevBtn = event.target.closest('[data-action="gallery-prev"]');
    if (prevBtn) {
      const galleryEl = prevBtn.closest("[data-gallery]");
      if (galleryEl) setGalleryIndex(galleryEl, getGalleryIndex(galleryEl) - 1);
      return;
    }

    const nextBtn = event.target.closest('[data-action="gallery-next"]');
    if (nextBtn) {
      const galleryEl = nextBtn.closest("[data-gallery]");
      if (galleryEl) setGalleryIndex(galleryEl, getGalleryIndex(galleryEl) + 1);
      return;
    }

    const thumbBtn = event.target.closest('[data-action="gallery-select"]');
    if (thumbBtn) {
      const galleryEl = thumbBtn.closest("[data-gallery]");
      if (galleryEl) setGalleryIndex(galleryEl, Number(thumbBtn.dataset.index));
      return;
    }

    if (event.target.closest('[data-action="lightbox-prev"]')) {
      if (lightboxGalleryEl) setGalleryIndex(lightboxGalleryEl, getGalleryIndex(lightboxGalleryEl) - 1);
      return;
    }

    if (event.target.closest('[data-action="lightbox-next"]')) {
      if (lightboxGalleryEl) setGalleryIndex(lightboxGalleryEl, getGalleryIndex(lightboxGalleryEl) + 1);
      return;
    }

    if (event.target.closest('[data-action="close-lightbox"]')) {
      closeLightbox();
      return;
    }

    // A click landing directly on the lightbox's own full-screen root
    // (never on `.image-lightbox__dialog` or anything inside it) is a
    // click outside the enlarged image — close it.
    if (event.target.id === "image-lightbox") {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    const lightbox = document.getElementById("image-lightbox");
    if (!lightbox || lightbox.hidden) return;

    if (event.key === "Escape") {
      closeLightbox();
    } else if (event.key === "ArrowRight" && lightboxGalleryEl) {
      setGalleryIndex(lightboxGalleryEl, getGalleryIndex(lightboxGalleryEl) + 1);
    } else if (event.key === "ArrowLeft" && lightboxGalleryEl) {
      setGalleryIndex(lightboxGalleryEl, getGalleryIndex(lightboxGalleryEl) - 1);
    }
  });

  setupGallerySwipe();
}

// Cookie consent banner + preferences modal (Version 7, Milestone
// 171H). Same modal philosophy as the image lightbox above —
// deliberately no hand-rolled Tab focus-trap loop, just Escape/close-
// button/backdrop-click, focus moved to the modal's own close button
// on open and back to whatever triggered it on close.
let cookiePreferencesTriggerEl = null;

function setupCookieConsent() {
  if (needsConsentPrompt()) {
    showCookieBanner();
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="cookie-accept"]')) {
      acceptAllConsent();
      hideCookieBanner();
      closeCookiePreferences();
      return;
    }

    if (event.target.closest('[data-action="cookie-reject"]')) {
      rejectNonEssentialConsent();
      hideCookieBanner();
      closeCookiePreferences();
      return;
    }

    const manageTrigger = event.target.closest('[data-action="cookie-manage"]');
    if (manageTrigger) {
      openCookiePreferences(manageTrigger);
      return;
    }

    if (event.target.closest('[data-action="cookie-save"]')) {
      const analytics = document.getElementById("cookie-category-analytics")?.checked ?? false;
      const marketing = document.getElementById("cookie-category-marketing")?.checked ?? false;
      saveConsent({ analytics, marketing });
      hideCookieBanner();
      closeCookiePreferences();
      return;
    }

    if (event.target.closest('[data-action="cookie-close-preferences"]')) {
      closeCookiePreferences();
      return;
    }

    // A click landing directly on the overlay backdrop (never on the
    // modal dialog itself or anything inside it) closes without saving
    // — same "click outside" convention as the image lightbox.
    if (event.target.hasAttribute("data-cookie-preferences-overlay")) {
      closeCookiePreferences();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (document.querySelector("[data-cookie-preferences-overlay]")) {
      closeCookiePreferences();
    }
  });
}

function showCookieBanner() {
  if (document.querySelector("[data-cookie-consent-banner]")) return;
  document.body.insertAdjacentHTML("beforeend", renderCookieConsentBanner());
}

function hideCookieBanner() {
  document.querySelector("[data-cookie-consent-banner]")?.remove();
}

// Version 7, Milestone 171H: reused by both the banner's own "Manage
// Preferences" button AND the footer's persistent "Cookie Settings"
// link (see components/footer.js) — either one calls this the same
// way, so a customer can change their mind at any time, not just
// during their first visit.
function openCookiePreferences(triggerEl) {
  if (document.querySelector("[data-cookie-preferences-overlay]")) return;
  cookiePreferencesTriggerEl = triggerEl || null;

  document.body.insertAdjacentHTML("beforeend", renderCookiePreferencesModal(getConsent()));
  document.body.classList.add("has-cookie-preferences-open");
  document.querySelector('[data-action="cookie-close-preferences"]')?.focus();
}

function closeCookiePreferences() {
  const overlay = document.querySelector("[data-cookie-preferences-overlay]");
  if (!overlay) return;

  overlay.remove();
  document.body.classList.remove("has-cookie-preferences-open");

  if (cookiePreferencesTriggerEl) {
    cookiePreferencesTriggerEl.focus();
    cookiePreferencesTriggerEl = null;
  }
}

document.addEventListener("DOMContentLoaded", mountApp);
