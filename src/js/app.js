// Application entry point.
// Mounts the header and footer once, creates the #main-content outlet
// the router renders pages into, and wires up global UI behaviour:
// the mobile menu toggle, the header search form, shop/search filter
// and sort controls, the quantity selector on the product details page,
// and a toast message for the (not-yet-functional) Add to Cart /
// Add to Wishlist buttons.

import { renderHeader } from "../components/header.js";
import { renderFooter } from "../components/footer.js";
import { initRouter } from "./router.js";

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
  setupProductActions();

  window.addEventListener("hashchange", onRouteChange);
  onRouteChange();
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

// One delegated listener handles Add to Cart, Add to Wishlist and the
// quantity selector across every page, since #main-content is replaced
// on every route change and per-render listeners would need re-binding.
function setupProductActions() {
  document.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;

    const action = actionEl.dataset.action;

    if (action === "add-to-cart") {
      showToast("Cart functionality coming in Milestone 4.");
    } else if (action === "add-to-wishlist") {
      showToast("Wishlist functionality coming in a future milestone.");
    } else if (action === "qty-increase" || action === "qty-decrease") {
      adjustQuantity(actionEl, action === "qty-increase" ? 1 : -1);
    }
  });
}

function adjustQuantity(buttonEl, delta) {
  const input = buttonEl.closest(".quantity-selector")?.querySelector(".quantity-selector__input");
  if (!input) return;

  const current = parseInt(input.value, 10) || 1;
  input.value = Math.max(1, current + delta);
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
