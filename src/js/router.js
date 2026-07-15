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
//
// Milestone 7 adds a `title` per route, set on document.title on every
// render — simple SEO/UX basics, not the fuller meta/OG/sitemap work
// planned for Milestone 8.
//
// Milestone 16 (Version 2 frontend/backend integration) allows a
// render(params) function to return either a string (as before) or a
// Promise<string> — needed by any page that now fetches from the
// backend API (product pages, order confirmation, order tracking).
// The router awaits either shape the same way, so pages that don't
// need async data don't have to change at all.

import { renderHome } from "../pages/home.js";
import { renderShop } from "../pages/shop.js";
import { renderCategories } from "../pages/categories.js";
import { renderProductDetails } from "../pages/productDetails.js";
import { renderSearchResults } from "../pages/searchResults.js";
import { renderCartPage } from "../pages/cartPage.js";
import { renderWishlistPage } from "../pages/wishlistPage.js";
import { renderCheckoutPage } from "../pages/checkoutPage.js";
import { renderOrderConfirmation } from "../pages/orderConfirmation.js";
import { renderPaymentSuccess } from "../pages/paymentSuccess.js";
import { renderPaymentCancelled } from "../pages/paymentCancelled.js";
import { renderPaymentFailed } from "../pages/paymentFailed.js";
import { renderTrackOrder } from "../pages/trackOrder.js";
import { renderAbout } from "../pages/about.js";
import { renderContact } from "../pages/contact.js";
import { renderFaq } from "../pages/faq.js";
import { renderPolicies } from "../pages/policies.js";
import { renderShippingPolicy } from "../pages/shippingPolicy.js";
import { renderReturnsPolicy } from "../pages/returnsPolicy.js";
import { renderPrivacyPolicy } from "../pages/privacyPolicy.js";
import { renderTerms } from "../pages/terms.js";
import { renderCookiesPolicy } from "../pages/cookiesPolicy.js";
import { renderTestimonials } from "../pages/testimonials.js";
import { renderSchools } from "../pages/schools.js";
import { renderWholesale } from "../pages/wholesale.js";
import { renderDistributor } from "../pages/distributor.js";
import { renderBlog } from "../pages/blog.js";
import { renderBlogPost } from "../pages/blogPost.js";
import { renderNotFound } from "../pages/notFound.js";

const routeDefs = [
  { pattern: "/", render: renderHome, title: "Home" },
  { pattern: "/shop", render: renderShop, title: "Shop" },
  { pattern: "/categories", render: renderCategories, title: "Categories" },
  { pattern: "/product/:slug", render: renderProductDetails, title: "Product" },
  { pattern: "/search", render: renderSearchResults, title: "Search" },
  { pattern: "/cart", render: renderCartPage, title: "Your Cart" },
  { pattern: "/wishlist", render: renderWishlistPage, title: "Your Wishlist" },
  { pattern: "/checkout", render: renderCheckoutPage, title: "Checkout" },
  { pattern: "/order-confirmation", render: renderOrderConfirmation, title: "Order Confirmation" },
  { pattern: "/payment-success", render: renderPaymentSuccess, title: "Payment Successful" },
  { pattern: "/payment-cancelled", render: renderPaymentCancelled, title: "Payment Cancelled" },
  { pattern: "/payment-failed", render: renderPaymentFailed, title: "Payment Failed" },
  { pattern: "/track-order", render: renderTrackOrder, title: "Track Your Order" },
  { pattern: "/about", render: renderAbout, title: "About Us" },
  { pattern: "/contact", render: renderContact, title: "Contact Us" },
  { pattern: "/faq", render: renderFaq, title: "FAQ" },
  { pattern: "/policies", render: renderPolicies, title: "Policies" },
  { pattern: "/shipping-policy", render: renderShippingPolicy, title: "Shipping Policy" },
  { pattern: "/returns-policy", render: renderReturnsPolicy, title: "Returns Policy" },
  { pattern: "/privacy-policy", render: renderPrivacyPolicy, title: "Privacy Policy" },
  { pattern: "/terms", render: renderTerms, title: "Terms & Conditions" },
  { pattern: "/cookies-policy", render: renderCookiesPolicy, title: "Cookies Policy" },
  { pattern: "/testimonials", render: renderTestimonials, title: "Testimonials" },
  { pattern: "/schools", render: renderSchools, title: "Schools" },
  { pattern: "/wholesale", render: renderWholesale, title: "Wholesale" },
  { pattern: "/distributor", render: renderDistributor, title: "Become a Distributor" },
  { pattern: "/blog", render: renderBlog, title: "Blog" },
  { pattern: "/blog/:slug", render: renderBlogPost, title: "Blog" },
];

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
      return { render: route.render, title: route.title, params };
    }
  }
  return null;
}

async function renderCurrentRoute() {
  const main = document.getElementById("main-content");
  if (!main) return;

  const { path, query } = parseHash();
  const matched = matchRoute(path);

  document.title = matched ? `${matched.title} | Seasonedz Group` : "Page Not Found | Seasonedz Group";

  const result = matched ? matched.render({ ...matched.params, query }) : renderNotFound();
  main.innerHTML = result instanceof Promise ? await result : result;
}

async function resolveRoute() {
  await renderCurrentRoute();
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function initRouter() {
  window.addEventListener("hashchange", resolveRoute);
  resolveRoute();
}

// Re-renders the current route in place — used after a cart/wishlist
// action changes Local Storage so the page (e.g. the cart page's item
// list and totals) reflects the new state immediately. Unlike a real
// navigation, this does not scroll back to the top, since the user is
// mid-interaction on the page they're already looking at.
export function rerenderCurrentRoute() {
  renderCurrentRoute();
}
