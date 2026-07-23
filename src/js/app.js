// Application entry point.
// Mounts the header and footer once, creates the #main-content outlet
// the router renders pages into, and wires up global UI behaviour:
// the mobile menu toggle, the header search form, shop/search filter
// and sort controls, the quantity selector on the product details page,
// cart/wishlist actions, the guest checkout form, the order tracking
// form, demo enquiry forms (contact/schools/wholesale/distributor),
// header badge counters, and toast feedback.

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
import { toggleWishlist, removeFromWishlist, clearWishlist, getWishlistCount } from "./wishlist.js";
import { validateCheckoutForm } from "./validation.js";
import { ApiError, ApiUnavailableError } from "./apiClient.js";
import { buildOrderPayload, createOrder } from "./api/ordersApi.js";
import { submitEnquiry } from "./api/enquiriesApi.js";
import { retryPayfastPayment } from "./payfastRetry.js";
import { adminLogin, adminLogout } from "./api/adminAuthApi.js";
import {
  updateAdminOrderStatus,
  updateAdminShipping,
  getAdminCourierQuote,
  bookAdminCourier,
  createAdminProduct,
  updateAdminProduct,
  uploadProductImage,
  updateProductImage,
  deleteProductImage,
} from "./api/adminDashboardApi.js";
import { isUnauthenticated, redirectToAdminLogin, setPendingAdminMessage } from "./adminGuard.js";
import { humanizeEnum } from "./adminFormat.js";
import { escapeHtml } from "./search.js";

function mountApp() {
  const app = document.getElementById("app");
  if (!app) return;

  app.insertAdjacentHTML("afterbegin", renderHeader());
  app.insertAdjacentHTML("beforeend", '<main id="main-content"></main>');
  app.insertAdjacentHTML("beforeend", renderFooter());

  initRouter();
  setupMobileMenu();
  setupImageFallback();
  setupHeaderSearch();
  setupFilterControls();
  setupCartQuantityInput();
  setupProductActions();
  setupCheckoutForm();
  setupTrackOrderForm();
  setupEnquiryForms();
  setupAdminLoginForm();
  setupAdminOrderStatusForm();
  setupAdminShippingForm();
  setupAdminCourierQuoteForm();
  setupAdminBookCourierArea();
  setupAdminProductFilterForm();
  setupAdminProductForm();
  setupAdminProductImages();

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
}

function setupMobileMenu() {
  const toggle = document.querySelector(".site-header__mobile-toggle");
  const panel = document.querySelector(".site-header__collapsible");
  if (!toggle || !panel) return;

  toggle.addEventListener("click", () => {
    panel.classList.toggle("is-open");
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
    updateCartQuantity(input.dataset.productId, quantity);
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
    } else if (action === "cart-increase") {
      increaseCartQuantity(actionEl.dataset.productId);
      rerenderCurrentRoute();
      updateHeaderCounters();
    } else if (action === "cart-decrease") {
      decreaseCartQuantity(actionEl.dataset.productId);
      rerenderCurrentRoute();
      updateHeaderCounters();
    } else if (action === "cart-remove") {
      removeFromCart(actionEl.dataset.productId);
      rerenderCurrentRoute();
      updateHeaderCounters();
      showToast("Item removed from cart.");
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
    } else if (action === "toggle-mobile-filters") {
      handleToggleMobileFilters(actionEl);
    }
  });
}

// Add to Cart on the product details page must use the selected
// quantity; everywhere else (product cards, wishlist page) there's no
// quantity selector nearby, so it defaults to 1.
function handleAddToCart(buttonEl) {
  const quantityInput = buttonEl.closest(".product-details")?.querySelector(".quantity-selector__input");
  const quantity = quantityInput ? Math.max(1, parseInt(quantityInput.value, 10) || 1) : 1;

  const product = readProductFromButton(buttonEl);
  addToCart(product, quantity);

  updateHeaderCounters();
  showToast(`${product.name} added to cart.`);
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
}

// Updates a wishlist button's visual state in place. Product cards use
// an icon-only circular button (product-card__wishlist); the product
// details page uses a full-width text button instead.
function patchWishlistButton(buttonEl, isActive) {
  const name = buttonEl.dataset.name || "product";

  buttonEl.classList.toggle("is-active", isActive);
  buttonEl.setAttribute("aria-pressed", String(isActive));

  if (buttonEl.classList.contains("product-card__wishlist")) {
    buttonEl.innerHTML = isActive ? "&#9829;" : "&#9825;";
    buttonEl.setAttribute("aria-label", isActive ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`);
  } else {
    buttonEl.textContent = isActive ? "Remove from Wishlist" : "Add to Wishlist";
  }
}

function adjustQuantity(buttonEl, delta) {
  const input = buttonEl.closest(".quantity-selector")?.querySelector(".quantity-selector__input");
  if (!input) return;

  const current = parseInt(input.value, 10) || 1;
  input.value = Math.max(1, current + delta);
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
  const firstErrorEl = form.querySelector(".form-field__input.has-error, .payment-methods.has-error");
  if (!firstErrorEl) return;

  const focusTarget = firstErrorEl.matches(".payment-methods")
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
  const payload = buildOrderPayload({
    customer: {
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: data.email.trim(),
      phone: data.phone.trim(),
    },
    deliveryAddress: {
      street: data.street.trim(),
      suburb: data.suburb.trim(),
      city: data.city.trim(),
      province: data.province,
      postalCode: data.postalCode.trim(),
    },
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
      await redirectToPayfast(orderNumber);
      return;
    }

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

// Admin login form (Version 7, Milestone 58 — foundation only). Same
// delegated-submit shape as the other forms here. On success, the
// backend has already set the session cookie (credentials: "include",
// see js/api/adminAuthApi.js) by the time this resolves, so a plain
// hash navigation to /admin is enough — no token to store here.
function setupAdminLoginForm() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("#admin-login-form");
    if (!form) return;

    event.preventDefault();
    handleAdminLoginSubmit(form);
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
    await adminLogin(email, password);
    navigateTo("/admin");
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
  const priceDisplay = Number.isFinite(price) ? `R${price.toFixed(2)}` : "—";

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

document.addEventListener("DOMContentLoaded", mountApp);
