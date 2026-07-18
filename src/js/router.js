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
//
// Version 6, Milestone 48 adds an optional `description` per route,
// applied via js/seo.js alongside `title` on every navigation — a
// route without one falls back to the site's own default description
// (see seo.js), never stale text left over from a previous page. Pages
// whose content depends on async data (currently just Product
// details) call setPageMeta()/setPageStructuredData() again themselves
// once they know more, overriding these generic defaults.

import { setPageMeta, clearPageStructuredData } from "./seo.js";
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
  { pattern: "/search", render: renderSearchResults, title: "Search" },
  { pattern: "/cart", render: renderCartPage, title: "Your Cart" },
  { pattern: "/wishlist", render: renderWishlistPage, title: "Your Wishlist" },
  { pattern: "/checkout", render: renderCheckoutPage, title: "Checkout" },
  { pattern: "/order-confirmation", render: renderOrderConfirmation, title: "Order Confirmation" },
  { pattern: "/payment-success", render: renderPaymentSuccess, title: "Payment Successful" },
  { pattern: "/payment-cancelled", render: renderPaymentCancelled, title: "Payment Cancelled" },
  { pattern: "/payment-failed", render: renderPaymentFailed, title: "Payment Failed" },
  { pattern: "/track-order", render: renderTrackOrder, title: "Track Your Order" },
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
  // Version 7, Milestone 58: admin auth foundation only. Deliberately
  // not linked from header/footer/any customer navigation — see
  // VERSION_7_ADMIN_AUTH_FOUNDATION_RESULT.md's "Navigation Safety"
  // section. renderAdminHome checks auth itself and redirects to
  // /admin/login when not signed in, same as every other async page.
  { pattern: "/admin/login", render: renderAdminLogin, title: "Admin Login" },
  { pattern: "/admin", render: renderAdminHome, title: "Admin" },
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
      return { render: route.render, title: route.title, description: route.description, params };
    }
  }
  return null;
}

async function renderCurrentRoute() {
  const main = document.getElementById("main-content");
  if (!main) return;

  const { path, query } = parseHash();
  const matched = matchRoute(path);

  // Cleared unconditionally before every render so a page that doesn't
  // set its own structured data never inherits stale data left over
  // from whatever the customer viewed previously — see js/seo.js.
  clearPageStructuredData();
  setPageMeta({ title: matched ? matched.title : "Page Not Found", description: matched?.description });

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
