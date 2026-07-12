// Minimal hash-based router.
// Each page module exports a render(params) function that returns an
// HTML string. The router swaps that string into #main-content whenever
// the URL hash changes, so every page listed in the folder structure is
// already reachable, even the ones that are still placeholders.
//
// Milestone 2 extends the original exact-match router with:
//  - dynamic segments, e.g. "/product/:slug" -> { slug: "..." }
//  - a query string, e.g. "#/shop?category=bundles" -> params.query
// Pages that don't need params simply ignore the argument.

import { renderHome } from "../pages/home.js";
import { renderShop } from "../pages/shop.js";
import { renderCategories } from "../pages/categories.js";
import { renderProductDetails } from "../pages/productDetails.js";
import { renderSearchResults } from "../pages/searchResults.js";
import { renderCartPage } from "../pages/cartPage.js";
import { renderWishlistPage } from "../pages/wishlistPage.js";
import { renderCheckoutPage } from "../pages/checkoutPage.js";
import { renderOrderConfirmation } from "../pages/orderConfirmation.js";
import { renderTrackOrder } from "../pages/trackOrder.js";
import { renderAbout } from "../pages/about.js";
import { renderContact } from "../pages/contact.js";
import { renderFaq } from "../pages/faq.js";
import { renderPolicies } from "../pages/policies.js";

const routeDefs = [
  { pattern: "/", render: renderHome },
  { pattern: "/shop", render: renderShop },
  { pattern: "/categories", render: renderCategories },
  { pattern: "/product/:slug", render: renderProductDetails },
  { pattern: "/search", render: renderSearchResults },
  { pattern: "/cart", render: renderCartPage },
  { pattern: "/wishlist", render: renderWishlistPage },
  { pattern: "/checkout", render: renderCheckoutPage },
  { pattern: "/order-confirmation", render: renderOrderConfirmation },
  { pattern: "/track-order", render: renderTrackOrder },
  { pattern: "/about", render: renderAbout },
  { pattern: "/contact", render: renderContact },
  { pattern: "/faq", render: renderFaq },
  { pattern: "/policies", render: renderPolicies },
];

function renderNotFound() {
  return `
    <section class="section container">
      <div class="placeholder-panel">
        <h2>Page not found</h2>
        <p>The page you're looking for doesn't exist yet.</p>
      </div>
    </section>
  `;
}

// Splits "#/product/abc?ref=home" into { path: "/product/abc", query: URLSearchParams }
function parseHash() {
  const raw = window.location.hash.slice(1) || "/";
  const [pathPart, queryPart] = raw.split("?");
  return {
    path: pathPart || "/",
    query: new URLSearchParams(queryPart || ""),
  };
}

// Matches a path like "/product/abc" against a pattern like
// "/product/:slug", returning the named params, or null if no match.
function matchRoute(path) {
  for (const route of routeDefs) {
    const paramNames = [];
    const regexSource = route.pattern.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return "([^/]+)";
    });
    const match = path.match(new RegExp(`^${regexSource}$`));

    if (match) {
      const params = {};
      paramNames.forEach((name, index) => {
        params[name] = decodeURIComponent(match[index + 1]);
      });
      return { render: route.render, params };
    }
  }
  return null;
}

function resolveRoute() {
  const main = document.getElementById("main-content");
  if (!main) return;

  const { path, query } = parseHash();
  const matched = matchRoute(path);

  main.innerHTML = matched ? matched.render({ ...matched.params, query }) : renderNotFound();
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function initRouter() {
  window.addEventListener("hashchange", resolveRoute);
  resolveRoute();
}
