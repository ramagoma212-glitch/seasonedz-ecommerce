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
export default defineConfig({
  base: "/",
});
