import { defineConfig } from "vite";

// Version 7, Milestone 82A: switched from "/seasonedz-ecommerce/" to
// root "/" ahead of moving off the GitHub Pages project-site URL onto
// the custom domain www.seasonedzgroup.co.za (see public/CNAME and
// DOMAIN_CONNECTION_PLAN_CO_ZA.md). A custom domain is served at its
// own root, not under a repo-name path, so every asset URL must be
// root-relative instead of repo-name-prefixed. This is a code-only
// change — it takes effect only once this branch is actually merged
// and deployed together with the real domain cutover (DNS + GitHub
// Pages custom domain), not before; deploying it while the site is
// still only reachable at the old
// https://ramagoma212-glitch.github.io/seasonedz-ecommerce/ URL would
// break asset loading there.
// Milestone 190B, Part C/E: forces every module js/adminBundle.js
// re-exports into exactly one real chunk, instead of Rollup's default
// behaviour of keeping each one as its own separate chunk whenever
// it's reachable from more than one dynamic import() call site (which
// every one of these is — e.g. api/adminAuthApi.js is imported both by
// adminBundle.js AND by the lazy /admin/login page module itself). A
// plain `export * as` barrel alone does not change that default
// (confirmed empirically). Deliberately ONE chunk covering everything,
// including the product-form/Quill pair — an earlier two-chunk attempt
// (Quill kept separate) produced a genuine circular chunk dependency
// between the two forced groups, which broke every admin action
// site-wide until it was reverted; see adminBundle.js's own header
// comment for the full story. A single chunk has nothing to circle
// back to.
function adminManualChunks(id) {
  const adminModules = [
    "src/js/api/adminAuthApi.js",
    "src/js/api/adminUsersApi.js",
    "src/js/api/adminWelcomeGiftApi.js",
    "src/js/api/adminDashboardApi.js",
    "src/js/api/adminAffiliateApi.js",
    "src/js/api/adminReferralsApi.js",
    "src/js/api/adminPreorderApi.js",
    "src/pages/adminReferralAffiliateProductForm.js",
    "src/js/api/contentStudioApi.js",
    "src/pages/adminContentContextPreview.js",
    "src/js/marketingLinks.js",
    "src/js/api/campaignBriefApi.js",
    "src/js/api/adminAffiliateApplicationsApi.js",
    "src/js/adminGuard.js",
    "src/js/adminFormat.js",
    "src/pages/adminProductForm.js",
    "src/js/descriptionEditor.js",
  ];

  const normalized = id.replace(/\\/g, "/");
  if (adminModules.some((path) => normalized.endsWith(path))) return "admin";
  return undefined;
}

export default defineConfig({
  base: "/",
  build: {
    rollupOptions: {
      output: {
        manualChunks: adminManualChunks,
      },
    },
  },
});
