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
import { captureReferralFromUrl } from "./referral.js";
import {
  renderProductGridSkeleton,
  renderCategoryGridSkeleton,
  renderProductDetailSkeleton,
  renderHomeSkeleton,
} from "../components/skeleton.js";
import { renderHome } from "../pages/home.js";
import { renderShop } from "../pages/shop.js";
import { renderCategories } from "../pages/categories.js";
import { renderCategoryPage } from "../pages/categoryPage.js";
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
import { renderAccount } from "../pages/accountPage.js";
import { renderAccountOrderDetail } from "../pages/accountOrderDetail.js";
import { renderForgotPassword } from "../pages/forgotPasswordPage.js";
import { renderResetPassword } from "../pages/resetPasswordPage.js";
import { renderAffiliateApplicationPage } from "../pages/affiliateApplicationPage.js";
import { renderGuestDownloadPage } from "../pages/guestDownloadPage.js";
import { renderAbout } from "../pages/about.js";
import { renderContact } from "../pages/contact.js";
import { renderFaq } from "../pages/faq.js";
import { renderPolicies } from "../pages/policies.js";
import { renderShippingPolicy } from "../pages/shippingPolicy.js";
import { renderReturnsPolicy } from "../pages/returnsPolicy.js";
import { renderPrivacyPolicy } from "../pages/privacyPolicy.js";
import { renderTerms } from "../pages/terms.js";
import { renderCookiesPolicy } from "../pages/cookiesPolicy.js";
import { renderAffiliateTerms } from "../pages/affiliateTerms.js";
import { renderSchools } from "../pages/schools.js";
import { renderWholesale } from "../pages/wholesale.js";
import { renderDistributor } from "../pages/distributor.js";
import { renderBlog } from "../pages/blog.js";
import { renderBlogPost } from "../pages/blogPost.js";
import { renderNotFound } from "../pages/notFound.js";
import { renderAdminLogin } from "../pages/adminLogin.js";
import { renderAdminForgotPassword } from "../pages/adminForgotPasswordPage.js";
import { renderAdminResetPassword } from "../pages/adminResetPasswordPage.js";
import { renderAdminActivateAccount } from "../pages/adminActivateAccount.js";
import { renderAdminUsers } from "../pages/adminUsers.js";
import { renderAdminUserInviteForm } from "../pages/adminUserInviteForm.js";
import { renderAdminHome } from "../pages/adminHome.js";
import { renderAdminOrders } from "../pages/adminOrders.js";
import { renderAdminOrderDetail } from "../pages/adminOrderDetail.js";
import { renderAdminEnquiries } from "../pages/adminEnquiries.js";
import { renderAdminReviews } from "../pages/adminReviews.js";
import { renderAdminProducts } from "../pages/adminProducts.js";
import { renderAdminProductCreate, renderAdminProductEdit, renderAdminProductRedirectToEdit } from "../pages/adminProductForm.js";
import { renderAdminAffiliateProducts } from "../pages/adminAffiliateProducts.js";
import { renderAdminAffiliateProductCreate, renderAdminAffiliateProductEdit } from "../pages/adminAffiliateProductForm.js";
import { renderAdminReferralsOverview } from "../pages/adminReferralsOverview.js";
import { renderAdminReferralAffiliates } from "../pages/adminReferralAffiliates.js";
import { renderAdminReferralAffiliateCreate, renderAdminReferralAffiliateEdit } from "../pages/adminReferralAffiliateForm.js";
import { renderAdminReferralAffiliateProducts } from "../pages/adminReferralAffiliateProducts.js";
import { renderAdminReferralAffiliateProductCreate, renderAdminReferralAffiliateProductEdit } from "../pages/adminReferralAffiliateProductForm.js";
import { renderAdminAffiliateApplications } from "../pages/adminAffiliateApplications.js";
import { renderAdminAffiliateApplicationDetail } from "../pages/adminAffiliateApplicationDetail.js";
import { renderAdminReferralSettings } from "../pages/adminReferralSettings.js";
import { renderAdminReferralCommissions } from "../pages/adminReferralCommissions.js";
import { renderAdminReferralCommissionDetail } from "../pages/adminReferralCommissionDetail.js";
import { renderAdminReferralPayouts } from "../pages/adminReferralPayouts.js";
// Milestone 181, Part D: the preorder programme's own settings page —
// separate from Referrals above, reached from the Products page.
import { renderAdminPreorderSettings } from "../pages/adminPreorderSettings.js";
// Content Studio Phase 2: Brand Knowledge Foundation only — no
// campaign/generation/publishing page exists anywhere yet.
import { renderAdminBrandKnowledge } from "../pages/adminBrandKnowledge.js";
import { renderAdminBrandKnowledgeCreate, renderAdminBrandKnowledgeEdit } from "../pages/adminBrandKnowledgeForm.js";
import { renderAdminContentPillars } from "../pages/adminContentPillars.js";
import { renderAdminContentPillarCreate, renderAdminContentPillarEdit } from "../pages/adminContentPillarForm.js";
import { renderAdminAudiences } from "../pages/adminAudiences.js";
import { renderAdminAudienceCreate, renderAdminAudienceEdit } from "../pages/adminAudienceForm.js";
import { renderAdminContentContextPreview } from "../pages/adminContentContextPreview.js";

// Version 7, Milestone 92B: an optional `skeleton` per route names an
// entry in SKELETON_RENDERERS below — shown immediately, before
// awaiting the route's render() Promise, for routes whose content
// depends on the async getCatalog() call (Milestone 92A found this,
// not missing image dimensions, was the real cause of the site's high
// CLS: these pages render completely empty until data resolves, then
// suddenly fill with a full grid of cards). A route without one is
// unaffected — most routes render synchronously already and have
// nothing to reserve space for.
const routeDefs = [
  // Version 7, Milestone 171G: fullTitle/description bring the LIVE
  // rendered homepage <title>/meta description in line with the target
  // Google branded search appearance — see js/seo.js's own comment on
  // why the plain `title` field alone (used by every other route)
  // wasn't enough for the homepage specifically.
  {
    pattern: "/",
    render: renderHome,
    title: "Home",
    fullTitle: "Seasonedz Group | Colouring Books & Creative Products",
    description:
      "Shop educational, Bible and mindfulness colouring books, markers, crayons and creative products for kids, families, schools and churches in South Africa.",
    skeleton: "home",
  },
  {
    pattern: "/shop",
    render: renderShop,
    title: "Shop",
    description: "Browse educational colouring books, Bible colouring books, mindfulness colouring books, markers and crayons from Seasonedz Group.",
    skeleton: "product-grid",
  },
  // Version 7, Milestone 171I: real, path-based category landing pages
  // — see categoryPage.js's own header comment for why this exists
  // (fixes a canonical-tag bug that undermined every category's own
  // ability to rank independently). "Category" here is just the
  // router-level fallback shown for the instant before data loads —
  // renderCategoryPage()'s reused shop.js logic immediately overrides
  // it with the real category name once the catalogue resolves, same
  // pattern as /product/:slug below.
  {
    pattern: "/category/:slug",
    render: renderCategoryPage,
    title: "Category",
    skeleton: "product-grid",
  },
  {
    pattern: "/categories",
    render: renderCategories,
    title: "Categories",
    description: "Shop Seasonedz Group colouring books and creative supplies by category, from kids' colouring books to mindfulness colouring for adults.",
    skeleton: "category-grid",
  },
  { pattern: "/product/:slug", render: renderProductDetails, title: "Product", skeleton: "product-detail" },
  // Version 7, Milestone 88A: noindex below marks routes that are
  // either an internal search results listing (best-practice per
  // Google's own webmaster guidance — never useful as a search
  // result), private to one visitor's session (cart, wishlist), or
  // transactional/order-specific (checkout, order-confirmation, the
  // three payment status pages, track-order) — none of these are
  // pages a search engine should ever surface publicly.
  // No skeleton here even though it shares getCatalog() with /shop:
  // renderSearchResults() returns instantly (no data needed at all)
  // for the common "no search term yet" case, but is still an async
  // function, so a skeleton mapped here would show — and then be
  // replaced by that small static prompt — every time, a worse look
  // than today's plain instant render for that case. Left out of
  // scope for this milestone rather than adding query-aware routing
  // logic just to handle it.
  { pattern: "/search", render: renderSearchResults, title: "Search", noindex: true },
  { pattern: "/cart", render: renderCartPage, title: "Your Cart", noindex: true },
  { pattern: "/wishlist", render: renderWishlistPage, title: "Your Wishlist", noindex: true },
  { pattern: "/checkout", render: renderCheckoutPage, title: "Checkout", noindex: true },
  { pattern: "/order-confirmation", render: renderOrderConfirmation, title: "Order Confirmation", noindex: true },
  { pattern: "/payment-success", render: renderPaymentSuccess, title: "Payment Successful", noindex: true },
  { pattern: "/payment-cancelled", render: renderPaymentCancelled, title: "Payment Cancelled", noindex: true },
  { pattern: "/payment-failed", render: renderPaymentFailed, title: "Payment Failed", noindex: true },
  { pattern: "/track-order", render: renderTrackOrder, title: "Track Your Order", noindex: true },
  // Version 7, Milestone 128: customer account foundation — login,
  // registration, and a simple logged-in overview only, no order
  // history yet. noindex like every other visitor-private/account page
  // here (cart, wishlist, checkout, track-order).
  { pattern: "/account", render: renderAccount, title: "My Account", noindex: true },
  // Version 7, Milestone 130: real order history — the backend already
  // scopes every lookup to the logged-in customer's own orders (see
  // backend/src/controllers/customerOrder.controller.ts), so this page
  // never needs to check ownership itself.
  { pattern: "/account/orders/:orderNumber", render: renderAccountOrderDetail, title: "Order Details", noindex: true },
  // Version 7, Milestone 132: forgot/reset password — both logged-out
  // flows, noindex like every other account page. reset-password reads
  // its token from the query string (query.get("token")), not a route
  // param, so the router's flattened { ...params, query } call
  // convention already covers it without any extra pattern segment.
  { pattern: "/account/forgot-password", render: renderForgotPassword, title: "Forgot Password", noindex: true },
  { pattern: "/account/reset-password", render: renderResetPassword, title: "Reset Password", noindex: true },
  // Version 7, Milestone 176: affiliate application/document
  // verification — logged-in only (the page itself shows a sign-in
  // prompt on a 401, same discipline as accountOrderDetail.js).
  { pattern: "/account/affiliate-application", render: renderAffiliateApplicationPage, title: "Affiliate Programme Application", noindex: true },
  // Version 7, Milestone 152: guest secure-token digital download
  // access — reached only via a one-time emailed link (see
  // guestDownloadPage.js's own comment). noindex like every other
  // account/order-specific page.
  { pattern: "/download/:token", render: renderGuestDownloadPage, title: "Your Digital Downloads", noindex: true },
  {
    // Owner content update (24 August 2026): title/description brought
    // in line with the new owner-approved About page content, see
    // about.js. "About Seasonedz Group" (not "About Us") to match the
    // page's own H1 exactly, per the brief's own suggested SEO title.
    pattern: "/about",
    render: renderAbout,
    title: "About Seasonedz Group",
    description: "A South African creative publishing and growing print business, making educational, Bible and mindfulness colouring books today while building towards print on demand for South African and African creators.",
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
  {
    pattern: "/shipping-policy",
    render: renderShippingPolicy,
    title: "Shipping Policy",
    description: "Delivery available nationwide through The Courier Guy. Locker to Locker R100, Door to Door R120, both free from R600, plus free Customer Collection in Pretoria or Thohoyandou.",
  },
  {
    // Owner content update (24 August 2026): title/description brought
    // in line with the new owner-approved Returns, Refunds and
    // Exchanges Policy, see returnsPolicy.js. Title matches the page's
    // own H1 exactly.
    pattern: "/returns-policy",
    render: renderReturnsPolicy,
    title: "Returns, Refunds and Exchanges Policy",
    description: "How Seasonedz Group handles returns, refunds and exchanges for physical products, books, creative supplies, personalised products and digital products, in line with South African consumer law.",
  },
  {
    // Owner content update (24 August 2026): description added for the
    // new owner-approved Privacy Policy, see privacyPolicy.js. Title
    // already matched the page's own H1 exactly.
    pattern: "/privacy-policy",
    render: renderPrivacyPolicy,
    title: "Privacy Policy",
    description: "How Seasonedz Group collects, uses, stores, shares and protects personal information, in line with the Protection of Personal Information Act, POPIA.",
  },
  {
    // Owner content update (24 August 2026): title/description brought
    // in line with the new owner-approved Terms and Conditions, see
    // terms.js. Title changed from "Terms & Conditions" to "Terms and
    // Conditions" to match the page's own H1 exactly.
    pattern: "/terms",
    render: renderTerms,
    title: "Terms and Conditions",
    description: "The terms and conditions that apply when you browse, create an account, place an order or purchase a digital product from Seasonedz Group.",
  },
  {
    pattern: "/cookies-policy",
    render: renderCookiesPolicy,
    title: "Cookie Policy",
    description: "What cookies and Local Storage Seasonedz Group actually uses, and how to manage your cookie preferences.",
  },
  {
    // Version 7, Milestone 172B.6: a real, indexable legal page (like
    // /terms, /privacy-policy, /cookies-policy above) — not noindex.
    pattern: "/affiliate-terms",
    render: renderAffiliateTerms,
    title: "Affiliate Programme Terms",
    description: "The rules of the Seasonedz Affiliate Programme, including referral discounts, commission rates, payouts, and affiliate responsibilities.",
  },
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
  // Milestone 179, Part D/B: admin forgotten/reset password and
  // invitation activation — deliberately separate from the customer
  // equivalents (/account/forgot-password, /account/reset-password),
  // never reachable through them. reset-password/activate read their
  // token from the query string, same convention as the customer pages.
  { pattern: "/admin/forgot-password", render: renderAdminForgotPassword, title: "Admin Forgot Password", noindex: true },
  { pattern: "/admin/reset-password", render: renderAdminResetPassword, title: "Admin Reset Password", noindex: true },
  { pattern: "/admin/activate", render: renderAdminActivateAccount, title: "Activate Admin Account", noindex: true },
  { pattern: "/admin", render: renderAdminHome, title: "Admin", noindex: true },
  { pattern: "/admin/orders/:orderNumber", render: renderAdminOrderDetail, title: "Admin Order", noindex: true },
  { pattern: "/admin/orders", render: renderAdminOrders, title: "Admin Orders", noindex: true },
  { pattern: "/admin/enquiries", render: renderAdminEnquiries, title: "Admin Enquiries", noindex: true },
  { pattern: "/admin/reviews", render: renderAdminReviews, title: "Admin Reviews", noindex: true },
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
  { pattern: "/admin/preorder-settings", render: renderAdminPreorderSettings, title: "Preorder Settings", noindex: true },
  { pattern: "/admin/products", render: renderAdminProducts, title: "Admin Products", noindex: true },
  // Version 7, Milestone 172B: admin affiliate-product management.
  // Same "/new" before "/:id/edit" ordering as /admin/products above.
  // Not linked from anywhere public, and no public route reads any of
  // this yet — the Recommended Books page and its own SEO metadata are
  // Milestone 172C.
  { pattern: "/admin/affiliate/new", render: renderAdminAffiliateProductCreate, title: "Add Affiliate Product", noindex: true },
  { pattern: "/admin/affiliate/:id/edit", render: renderAdminAffiliateProductEdit, title: "Edit Affiliate Product", noindex: true },
  { pattern: "/admin/affiliate", render: renderAdminAffiliateProducts, title: "Admin Affiliate Products", noindex: true },
  // Version 7, Milestone 172B.3: Seasonedz's own affiliate/referral
  // programme — a fully separate route tree from /admin/affiliate
  // above (see the 172B.2 audit). "/affiliates/new" before
  // "/affiliates/:id/edit", same ordering discipline as every other
  // admin list/:id-wildcard pair in this file. No referral discount or
  // commission is live on the public storefront yet — that's 172B.4/
  // 172B.5, so nothing here is linked from anywhere public.
  { pattern: "/admin/referrals/affiliates/new", render: renderAdminReferralAffiliateCreate, title: "Add Affiliate", noindex: true },
  { pattern: "/admin/referrals/affiliates/:id/edit", render: renderAdminReferralAffiliateEdit, title: "Edit Affiliate", noindex: true },
  { pattern: "/admin/referrals/affiliates", render: renderAdminReferralAffiliates, title: "Referral Affiliates", noindex: true },
  { pattern: "/admin/referrals/applications/:id", render: renderAdminAffiliateApplicationDetail, title: "Affiliate Application", noindex: true },
  { pattern: "/admin/referrals/applications", render: renderAdminAffiliateApplications, title: "Affiliate Applications", noindex: true },
  // Version 7, Milestone 172B.5: commission lifecycle + payout. "/:id"
  // before the bare list, same ordering discipline as every other
  // admin list/:id-wildcard pair in this file.
  { pattern: "/admin/referrals/commissions/:id", render: renderAdminReferralCommissionDetail, title: "Commission Detail", noindex: true },
  { pattern: "/admin/referrals/commissions", render: renderAdminReferralCommissions, title: "Referral Commissions", noindex: true },
  { pattern: "/admin/referrals/payouts", render: renderAdminReferralPayouts, title: "Referral Payouts", noindex: true },
  // Milestone 178, Part C: per-product commission configuration for
  // this same internal programme — "/new" before "/:id/edit", same
  // ordering discipline as every other admin list/:id-wildcard pair.
  { pattern: "/admin/referrals/affiliate-products/new", render: renderAdminReferralAffiliateProductCreate, title: "Add Affiliate Product", noindex: true },
  { pattern: "/admin/referrals/affiliate-products/:id/edit", render: renderAdminReferralAffiliateProductEdit, title: "Edit Affiliate Product", noindex: true },
  { pattern: "/admin/referrals/affiliate-products", render: renderAdminReferralAffiliateProducts, title: "Affiliate Products", noindex: true },
  { pattern: "/admin/referrals/settings", render: renderAdminReferralSettings, title: "Referral Programme Settings", noindex: true },
  { pattern: "/admin/referrals", render: renderAdminReferralsOverview, title: "Referrals", noindex: true },

  // Content Studio Phase 2: Brand Knowledge Foundation only — no
  // campaign/generation/publishing route exists anywhere yet. Most
  // specific pattern first, same ordering discipline as every route
  // group above.
  { pattern: "/admin/content-studio/brand-knowledge/new", render: renderAdminBrandKnowledgeCreate, title: "Add Brand Knowledge Entry", noindex: true },
  { pattern: "/admin/content-studio/brand-knowledge/:id/edit", render: renderAdminBrandKnowledgeEdit, title: "Edit Brand Knowledge Entry", noindex: true },
  { pattern: "/admin/content-studio/pillars/new", render: renderAdminContentPillarCreate, title: "Add Content Pillar", noindex: true },
  { pattern: "/admin/content-studio/pillars/:id/edit", render: renderAdminContentPillarEdit, title: "Edit Content Pillar", noindex: true },
  { pattern: "/admin/content-studio/pillars", render: renderAdminContentPillars, title: "Content Pillars", noindex: true },
  { pattern: "/admin/content-studio/audiences/new", render: renderAdminAudienceCreate, title: "Add Audience", noindex: true },
  { pattern: "/admin/content-studio/audiences/:id/edit", render: renderAdminAudienceEdit, title: "Edit Audience", noindex: true },
  { pattern: "/admin/content-studio/audiences", render: renderAdminAudiences, title: "Audiences", noindex: true },
  { pattern: "/admin/content-studio/context-preview", render: renderAdminContentContextPreview, title: "AI Context Preview", noindex: true },
  { pattern: "/admin/content-studio", render: renderAdminBrandKnowledge, title: "Content Studio", noindex: true },
  // Milestone 179, Part G: admin-user management — ADMIN-only,
  // backend-enforced (see adminUsers.routes.ts). "/invite" before the
  // bare list, same ordering discipline as every other admin
  // list/:id-wildcard pair in this file.
  { pattern: "/admin/users/invite", render: renderAdminUserInviteForm, title: "Invite Admin User", noindex: true },
  { pattern: "/admin/users", render: renderAdminUsers, title: "Admin Users", noindex: true },
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
        fullTitle: route.fullTitle,
        description: route.description,
        noindex: route.noindex,
        skeleton: route.skeleton,
        params,
      };
    }
  }
  return null;
}

// Version 7, Milestone 92B: maps each routeDefs `skeleton` name to the
// matching components/skeleton.js renderer.
const SKELETON_RENDERERS = {
  home: renderHomeSkeleton,
  "product-grid": renderProductGridSkeleton,
  "category-grid": renderCategoryGridSkeleton,
  "product-detail": renderProductDetailSkeleton,
};

async function renderCurrentRoute() {
  const main = document.getElementById("main-content");
  if (!main) return;

  const { path, query } = parseLocation();
  const matched = matchRoute(path);

  // Version 7, Milestone 172B.4: detects a ?ref=CODE on the CURRENT
  // page and, if present, captures it — covers a fresh external link
  // landing anywhere on the site AND an in-app link that happens to
  // carry ?ref=. Fire-and-forget: never awaited, so it can never delay
  // or block this render — see js/referral.js's own comment.
  void captureReferralFromUrl(query);

  // Cleared unconditionally before every render so a page that doesn't
  // set its own structured data never inherits stale data left over
  // from whatever the customer viewed previously — see js/seo.js.
  clearPageStructuredData();
  setPageMeta({
    title: matched ? matched.title : "Page Not Found",
    fullTitle: matched?.fullTitle,
    description: matched?.description,
    // An unmatched path (typo, stale/removed link, or straight-up not
    // a real page) is noindexed too, same as any other error state —
    // see js/seo.js.
    noindex: matched ? Boolean(matched.noindex) : true,
  });

  const result = matched ? matched.render({ ...matched.params, query }) : renderNotFound();

  if (result instanceof Promise) {
    // The render() call above has already kicked off its data fetch
    // (an async function runs synchronously up to its first await
    // before returning a Promise) — showing the skeleton here doesn't
    // delay that fetch by even a tick, it just reserves the right
    // amount of space while it's in flight. Fully replaced once the
    // real content resolves, so nothing needs cleaning up afterwards.
    const skeletonRenderer = matched?.skeleton && SKELETON_RENDERERS[matched.skeleton];
    if (skeletonRenderer) main.innerHTML = skeletonRenderer();
    main.innerHTML = await result;
  } else {
    main.innerHTML = result;
  }
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
