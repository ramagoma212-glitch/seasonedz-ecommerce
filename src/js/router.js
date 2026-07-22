// Path-based router (Version 7, Milestone 88A — migrated from the
// original hash router). Each page module exports a render(params)
// function that returns an HTML string. The router swaps that string
// into #main-content whenever the URL path changes, so every page
// listed in the folder structure is already reachable, even the ones
// that are still placeholders.
//
// Milestone 2 extends the original exact-match router with:
//  - dynamic segments, e.g. "/product/:slug" -> { slug: "..." }
//  - a query string, e.g. "/shop?category=bundles" -> params.query
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
//
// Version 6, Milestone 48 adds an optional `description` per route,
// applied via js/seo.js alongside `title` on every navigation — a
// route without one falls back to the site's own default description
// (see seo.js), never stale text left over from a previous page. Pages
// whose content depends on async data (currently just Product
// details) call setPageMeta()/setPageStructuredData() again themselves
// once they know more, overriding these generic defaults.
//
// Version 7, Milestone 88A: migrated from `window.location.hash` to
// real paths via the History API (`pushState`/`popstate`), so each
// page has its own indexable URL (e.g. /shop, /product/:slug) instead
// of every page collapsing to the same URL from a search engine's
// point of view. Two things a hash router got for free now need to be
// added explicitly:
//  - Clicking a real `<a href="/shop">` link normally triggers a full
//    page reload (unlike a `#/shop` link, which never did) — handled
//    below by intercepting same-origin, unmodified link clicks and
//    routing them through navigateTo() instead.
//  - An optional `noindex` per route, applied via js/seo.js — see its
//    own comment for why every navigation sets this explicitly rather
//    than only ever adding it.
// See also js/navigation.js (navigateTo, used by every former
// `window.location.hash = "..."` call site) and .github/workflows/
// deploy.yml's 404.html step (GitHub Pages has no server-side
// rewrites, so a direct visit to a real path needs that fallback).

import { setPageMeta, clearPageStructuredData } from "./seo.js";
import { navigateTo } from "./navigation.js";
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
import { renderAdminLogin } from "../pages/adminLogin.js";
import { renderAdminHome } from "../pages/adminHome.js";
import { renderAdminOrders } from "../pages/adminOrders.js";
import { renderAdminOrderDetail } from "../pages/adminOrderDetail.js";
import { renderAdminEnquiries } from "../pages/adminEnquiries.js";
import { renderAdminProducts } from "../pages/adminProducts.js";
import { renderAdminProductCreate, renderAdminProductEdit, renderAdminProductRedirectToEdit } from "../pages/adminProductForm.js";

const routeDefs = [
  { pattern: "/", render: renderHome, title: "Home" },
  {
    pattern: "/shop",
    render: renderShop,
    title: "Shop",
    description: "Browse educational colouring books, Bible colouring books, mindfulness colouring books, markers and crayons from Seasonedz Group.",
  },
  {
    pattern: "/categories",
    render: renderCategories,
    title: "Categories",
    description: "Shop Seasonedz Group colouring books and creative supplies by category, from kids' colouring books to mindfulness colouring for adults.",
  },
  { pattern: "/product/:slug", render: renderProductDetails, title: "Product" },
  // Version 7, Milestone 88A: noindex below marks routes that are
  // either an internal search results listing (best-practice per
  // Google's own webmaster guidance — never useful as a search
  // result), private to one visitor's session (cart, wishlist), or
  // transactional/order-specific (checkout, order-confirmation, the
  // three payment status pages, track-order) — none of these are
  // pages a search engine should ever surface publicly.
  { pattern: "/search", render: renderSearchResults, title: "Search", noindex: true },
  { pattern: "/cart", render: renderCartPage, title: "Your Cart", noindex: true },
  { pattern: "/wishlist", render: renderWishlistPage, title: "Your Wishlist", noindex: true },
  { pattern: "/checkout", render: renderCheckoutPage, title: "Checkout", noindex: true },
  { pattern: "/order-confirmation", render: renderOrderConfirmation, title: "Order Confirmation", noindex: true },
  { pattern: "/payment-success", render: renderPaymentSuccess, title: "Payment Successful", noindex: true },
  { pattern: "/payment-cancelled", render: renderPaymentCancelled, title: "Payment Cancelled", noindex: true },
  { pattern: "/payment-failed", render: renderPaymentFailed, title: "Payment Failed", noindex: true },
  { pattern: "/track-order", render: renderTrackOrder, title: "Track Your Order", noindex: true },
  {
    pattern: "/about",
    render: renderAbout,
    title: "About Us",
    description: "Seasonedz Group is a South African small business selling educational, Bible and mindfulness colouring books for families, schools and churches.",
  },
  {
    pattern: "/contact",
    render: renderContact,
    title: "Contact Us",
    description: "Get in touch with Seasonedz Group for questions about our colouring books, orders, delivery or wholesale enquiries.",
  },
  {
    pattern: "/faq",
    render: renderFaq,
    title: "FAQ",
    description: "Answers to common questions about ordering, delivery, payment and returns at Seasonedz Group.",
  },
  { pattern: "/policies", render: renderPolicies, title: "Policies" },
  { pattern: "/shipping-policy", render: renderShippingPolicy, title: "Shipping Policy" },
  { pattern: "/returns-policy", render: renderReturnsPolicy, title: "Returns Policy" },
  { pattern: "/privacy-policy", render: renderPrivacyPolicy, title: "Privacy Policy" },
  { pattern: "/terms", render: renderTerms, title: "Terms & Conditions" },
  { pattern: "/cookies-policy", render: renderCookiesPolicy, title: "Cookies Policy" },
  { pattern: "/testimonials", render: renderTestimonials, title: "Testimonials" },
  {
    pattern: "/schools",
    render: renderSchools,
    title: "Schools",
    description: "Colouring books and classroom packs for schools and Sunday schools, with wholesale pricing available from Seasonedz Group.",
  },
  {
    pattern: "/wholesale",
    render: renderWholesale,
    title: "Wholesale",
    description: "Wholesale colouring books and creative supplies for retailers and churches from Seasonedz Group. Request a quote today.",
  },
  {
    pattern: "/distributor",
    render: renderDistributor,
    title: "Become a Distributor",
    description: "Become a Seasonedz Group distributor and bring our colouring books and creative supplies to your community.",
  },
  { pattern: "/blog", render: renderBlog, title: "Blog" },
  { pattern: "/blog/:slug", render: renderBlogPost, title: "Blog" },
  // Version 7, Milestones 58-59: admin auth + read-only dashboard.
  // Deliberately not linked from header/footer/any customer
  // navigation — see VERSION_7_ADMIN_AUTH_FOUNDATION_RESULT.md's
  // "Navigation Safety" section. Every render function below checks
  // auth itself (via its own API call) and redirects to /admin/login
  // when not signed in, same as every other async page.
  // Version 7, Milestone 88A: every admin route is noindex — under the
  // old hash router, a fragment-only "URL" like /#/admin/login was
  // never separately fetchable by a crawler (it just rendered the
  // homepage), which accidentally kept admin content out of Google.
  // Real path routing removes that accident, so noindex here is now
  // load-bearing, not just extra caution — never rely on it as the
  // actual security boundary though; requireAdminAuth (server-side
  // session check) remains that.
  { pattern: "/admin/login", render: renderAdminLogin, title: "Admin Login", noindex: true },
  { pattern: "/admin", render: renderAdminHome, title: "Admin", noindex: true },
  { pattern: "/admin/orders/:orderNumber", render: renderAdminOrderDetail, title: "Admin Order", noindex: true },
  { pattern: "/admin/orders", render: renderAdminOrders, title: "Admin Orders", noindex: true },
  { pattern: "/admin/enquiries", render: renderAdminEnquiries, title: "Admin Enquiries", noindex: true },
  // Version 7, Milestone 67: admin product management. "/new" (a
  // literal) is listed before "/:id" (a wildcard) — both have the same
  // segment count after /admin/products, so registration order is what
  // stops "/admin/products/new" from being mis-matched as product id
  // "new". "/:id" has no separate read-only detail view — it redirects
  // straight to "/:id/edit" (VERSION_7_PRODUCT_MANAGEMENT_PLAN.md's
  // "keep it simple" allowance).
  { pattern: "/admin/products/new", render: renderAdminProductCreate, title: "Add Product", noindex: true },
  { pattern: "/admin/products/:id/edit", render: renderAdminProductEdit, title: "Edit Product", noindex: true },
  { pattern: "/admin/products/:id", render: renderAdminProductRedirectToEdit, title: "Product", noindex: true },
  { pattern: "/admin/products", render: renderAdminProducts, title: "Admin Products", noindex: true },
];

// Reads "/product/abc?ref=home" style URLs straight from the address
// bar into { path: "/product/abc", query: URLSearchParams } — no more
// splitting a hash string ourselves now that path and query string are
// both native browser concepts (window.location.pathname/.search).
//
// Version 7, Milestone 88F: a trailing slash is stripped before
// matching (but "/" itself is left alone — stripping its only slash
// would leave an empty string, not the root path). GitHub Pages
// redirects a bare generated route like /shop to /shop/ (standard
// static-host directory-redirect behaviour, triggered by Milestone
// 88D's per-route folders) — without this, matchRoute()'s exact-
// pattern regex would never match that trailing-slash form and would
// fall through to Not Found.
function parseLocation() {
  const rawPath = window.location.pathname || "/";
  const path = rawPath.length > 1 && rawPath.endsWith("/") ? rawPath.slice(0, -1) : rawPath;
  return {
    path,
    query: new URLSearchParams(window.location.search),
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
      return {
        render: route.render,
        title: route.title,
        description: route.description,
        noindex: route.noindex,
        params,
      };
    }
  }
  return null;
}

async function renderCurrentRoute() {
  const main = document.getElementById("main-content");
  if (!main) return;

  const { path, query } = parseLocation();
  const matched = matchRoute(path);

  // Cleared unconditionally before every render so a page that doesn't
  // set its own structured data never inherits stale data left over
  // from whatever the customer viewed previously — see js/seo.js.
  clearPageStructuredData();
  setPageMeta({
    title: matched ? matched.title : "Page Not Found",
    description: matched?.description,
    // An unmatched path (typo, stale/removed link, or straight-up not
    // a real page) is noindexed too, same as any other error state —
    // see js/seo.js.
    noindex: matched ? Boolean(matched.noindex) : true,
  });

  const result = matched ? matched.render({ ...matched.params, query }) : renderNotFound();
  main.innerHTML = result instanceof Promise ? await result : result;
}

async function resolveRoute() {
  await renderCurrentRoute();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function isModifiedClick(event) {
  return event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

// Intercepts clicks on same-origin, unmodified, non-download,
// non-new-tab links so ordinary in-app navigation (every header/
// footer/"Back to Shop"-style link) uses the History API instead of a
// full page reload — the same behaviour a `#/...` link gave for free
// before this migration. Middle-clicks, Ctrl/Cmd/Shift/Alt-clicks,
// target="_blank" links, download links and cross-origin/mailto:/tel:
// links are deliberately left alone so "open in new tab" and similar
// browser-native behaviour keeps working exactly as before.
function handleLinkClick(event) {
  if (isModifiedClick(event)) return;

  const anchor = event.target.closest("a[href]");
  if (!anchor) return;
  if (anchor.target && anchor.target !== "_self") return;
  if (anchor.hasAttribute("download")) return;
  if (anchor.origin !== window.location.origin) return;

  event.preventDefault();
  navigateTo(`${anchor.pathname}${anchor.search}${anchor.hash}`);
}

// Version 7, Milestone 88A Follow-Up: one-time backward-compatibility
// redirect for old saved/bookmarked/shared hash links (e.g.
// .../#/shop, .../#/admin/login) left over from before this
// migration. Runs once on initial load, before any route matching —
// history.replaceState swaps the address bar to the equivalent real
// path without adding a history entry (so pressing Back afterwards
// doesn't return to the old hash URL), and does not reintroduce hash
// routing in any way: every navigation from this point on only ever
// reads/writes pathname + search, exactly as the rest of this file
// already does. A hash that doesn't start with "/" (i.e. isn't one of
// this app's own old routes) is left untouched.
function redirectLegacyHashUrl() {
  const hash = window.location.hash;
  if (!hash.startsWith("#/")) return;

  const [path, queryString] = hash.slice(1).split("?");
  const search = queryString ? `?${queryString}` : "";

  window.history.replaceState(null, "", `${path}${search}`);
}

export function initRouter() {
  redirectLegacyHashUrl();
  window.addEventListener("popstate", resolveRoute);
  document.addEventListener("click", handleLinkClick);
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
