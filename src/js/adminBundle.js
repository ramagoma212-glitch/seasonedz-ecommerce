// Milestone 190B, Part C/E: a single aggregation point for every
// admin-only module, including the product-form/Quill pair. A customer
// page never reaches this file — nothing outside app.js's own
// admin-only gate (mountApp(), checked once against the page's initial
// /admin URL) ever imports it, so none of this (Quill included) is
// ever requested during a normal public visit — Part D's actual
// requirement.
//
// Deliberately ONE chunk, not two. An earlier attempt split this into
// adminCoreBundle.js (everything except product-form/Quill) plus a
// second adminProductFormBundle.js, forced into two separate chunks
// via vite.config.js's manualChunks, specifically to keep Quill's
// ~205 KB out of every /admin/* page that isn't the product form. That
// produced a genuine correctness bug, not just a missed optimisation:
// adminProductForm.js imports several functions from adminDashboardApi.js/
// adminAuthApi.js (both forced into the "core" chunk), while two of
// adminCoreBundle.js's own re-exported modules import back from
// adminProductForm.js/descriptionEditor.js — a real mutual/circular
// chunk dependency Rollup itself flagged ("Circular chunk: admin-
// product-form -> admin-core -> admin-product-form"). In production
// this reliably left the "core" bundle unable to finish initialising
// before an admin action fired, so approve/reject/suspend/reactivate
// (and everything else routed through it) silently never registered —
// confirmed empirically: it failed even with a 3-second wait, a real
// bug, not the ~300ms network-race this was originally meant to fix.
// One chunk has no other admin chunk to circle back to, which is what
// actually fixes both problems at once — every /admin/* page now pays
// for Quill's extra weight (an acceptable tradeoff for a small,
// trusted internal team, not the bandwidth-constrained mobile
// shoppers Part D's public-page requirement exists to protect), but
// every admin action's dependencies are guaranteed to finish loading
// together, in one request, before any of them can be called.
export * as adminAuthApi from "./api/adminAuthApi.js";
export * as adminUsersApi from "./api/adminUsersApi.js";
export * as adminWelcomeGiftApi from "./api/adminWelcomeGiftApi.js";
export * as adminDashboardApi from "./api/adminDashboardApi.js";
export * as adminAffiliateApi from "./api/adminAffiliateApi.js";
export * as adminReferralsApi from "./api/adminReferralsApi.js";
export * as adminPreorderApi from "./api/adminPreorderApi.js";
export * as adminReferralAffiliateProductForm from "../pages/adminReferralAffiliateProductForm.js";
export * as contentStudioApi from "./api/contentStudioApi.js";
export * as adminContentContextPreview from "../pages/adminContentContextPreview.js";
export * as marketingLinksModule from "./marketingLinks.js";
export * as campaignBriefApi from "./api/campaignBriefApi.js";
export * as adminAffiliateApplicationsApi from "./api/adminAffiliateApplicationsApi.js";
export * as adminGuard from "./adminGuard.js";
export * as adminFormat from "./adminFormat.js";
export * as adminProductForm from "../pages/adminProductForm.js";
export * as descriptionEditor from "./descriptionEditor.js";
