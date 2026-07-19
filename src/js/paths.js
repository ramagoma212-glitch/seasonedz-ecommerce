// Resolves a root-relative asset path (e.g. "/images/logo.png") against
// Vite's configured base path (see vite.config.js).
//
// Needed because hardcoded "/images/..." strings in data files and
// page/component markup are plain strings — Vite only rewrites paths it
// can see in HTML <link>/<script> tags or JS import statements, not
// arbitrary string literals — so without this they would 404 once the
// site is deployed under a sub-path, e.g. GitHub Pages project sites at
// "https://<username>.github.io/seasonedz-ecommerce/".
//
// Version 7, Milestone 69: product images can now also be full,
// already-absolute Supabase Storage URLs (e.g.
// "https://<project>.supabase.co/storage/v1/object/public/product-images/...")
// alongside the existing relative "/images/product-N.jpg" static
// paths — both are valid ProductImage.url values at once (see
// VERSION_7_PRODUCT_IMAGE_UPLOAD_PLAN.md Section 1/11). An absolute
// URL must be returned unchanged; prepending BASE_URL to it would
// mangle it (e.g. "/seasonedz-ecommerce/https://...") and 404. Only
// http/https are treated as pass-through — this function is only ever
// used for product/category image URLs, not arbitrary user input.
export function withBase(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return import.meta.env.BASE_URL + path.replace(/^\//, "");
}
