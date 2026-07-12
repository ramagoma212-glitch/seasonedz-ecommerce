// Application entry point.
// Mounts the header and footer once, creates the #main-content outlet
// the router renders pages into, and wires up global UI behaviour:
// the mobile menu toggle, the header search form, shop/search filter
// and sort controls, the quantity selector on the product details page,
// cart/wishlist actions, header badge counters, and toast feedback.

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
  getCartItemCount,
} from "./cart.js";
import { toggleWishlist, removeFromWishlist, clearWishlist, getWishlistCount } from "./wishlist.js";

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
