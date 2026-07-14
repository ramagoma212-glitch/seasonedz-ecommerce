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

function mountApp() {
  const app = document.getElementById("app");
  if (!app) return;

  app.insertAdjacentHTML("afterbegin", renderHeader());
  app.insertAdjacentHTML("beforeend", '<main id="main-content"></main>');
  app.insertAdjacentHTML("beforeend", renderFooter());

  initRouter();
  setupMobileMenu();
  setupHeaderSearch();
  setupFilterControls();
  setupCartQuantityInput();
  setupProductActions();
  setupCheckoutForm();
  setupTrackOrderForm();
  setupEnquiryForms();

  window.addEventListener("hashchange", onRouteChange);
  onRouteChange();
  updateHeaderCounters();
}

// The header is only rendered once at mount time (it never gets
// replaced like #main-content does), so it needs to be kept in sync
// with the route by hand: pre-fill the search box with the current
// ?q= term, and close the mobile menu after any navigation.
function onRouteChange() {
  const input = document.querySelector(".site-header__search input[type=search]");
  if (input) {
    const [, queryString] = window.location.hash.slice(1).split("?");
    const params = new URLSearchParams(queryString || "");
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

    window.location.hash = `/search?q=${encodeURIComponent(term)}`;
  });
}

// Any <select data-filter="..."> (category/price/age/stock/tag/sort on
// the shop and search results pages) updates the URL query string in
// place, which re-triggers the router via hashchange.
function setupFilterControls() {
  document.addEventListener("change", (event) => {
    const filterEl = event.target.closest("[data-filter]");
    if (!filterEl) return;

    const [path, queryString] = window.location.hash.slice(1).split("?");
    const params = new URLSearchParams(queryString || "");

    if (filterEl.value) {
      params.set(filterEl.dataset.filter, filterEl.value);
    } else {
      params.delete(filterEl.dataset.filter);
    }

    const nextQuery = params.toString();
    window.location.hash = `${path}${nextQuery ? `?${nextQuery}` : ""}`;
  });
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

    window.location.hash = `/order-confirmation?order=${encodeURIComponent(orderNumber)}`;
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

    window.location.hash = `/track-order?order=${encodeURIComponent(value)}`;
  });

  document.addEventListener("input", (event) => {
    const form = event.target.closest("#track-order-form");
    if (!form || event.target.id !== "orderNumber") return;

    const errorEl = form.querySelector('[data-error-for="orderNumber"]');
    if (errorEl) errorEl.textContent = "";
    event.target.classList.remove("has-error");
  });
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
