// Resolves a root-relative asset path (e.g. "/images/logo.png") against
// Vite's configured base path (see vite.config.js).
//
// Needed because hardcoded "/images/..." strings in data files and
// page/component markup are plain strings — Vite only rewrites paths it
// can see in HTML <link>/<script> tags or JS import statements, not
// arbitrary string literals — so without this they would 404 once the
// site is deployed under a sub-path, e.g. GitHub Pages project sites at
// "https://<username>.github.io/seasonedz-ecommerce/".
export function withBase(path) {
  return import.meta.env.BASE_URL + path.replace(/^\//, "");
}
