// Version 7, Milestone 97: builds Supabase Storage "render/image"
// transform URLs from an original public object URL, so product and
// category images can be requested close to their actual display
// size instead of always downloading the full original (Milestone 96
// found card images displaying at ~200-366px but downloading
// 1024x1024+ files, some over 1.6MB).
//
// Read-only by design: this only ever builds a URL for a GET request
// against the SAME stored object via Supabase's public render
// endpoint. It never writes to Storage, never deletes or overwrites
// anything, never changes ProductImage.url in the database, and never
// needs a Supabase key — the render endpoint is exactly as public as
// the plain object endpoint it's derived from.

const OBJECT_MARKER = "/storage/v1/object/public/";
const RENDER_MARKER = "/storage/v1/render/image/public/";

// Mirrors backend/src/services/supabaseStorage.service.ts's own
// isSupabaseStorageUrl() (kept as an independent copy, not imported,
// since that file is backend-only code) — a ProductImage/Category url
// is either a real Supabase Storage public object URL or a root-
// relative static frontend asset path left over from before the admin
// upload pipeline existed (e.g. "/images/product-1.jpg"). Only the
// former has a transform endpoint at all; the latter must be left
// completely unchanged.
export function isSupabaseStorageUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url) && url.includes(OBJECT_MARKER);
}

function buildDerivativeUrl(url, { width, height, quality, resize = "contain" }) {
  if (!isSupabaseStorageUrl(url)) return url;

  const transformedBase = url.replace(OBJECT_MARKER, RENDER_MARKER);
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    resize,
    quality: String(quality),
  });
  return `${transformedBase}?${params.toString()}`;
}

// Card-sized images: product cards, category cards, cart/wishlist
// items and related products all display at up to ~366px CSS width
// across this site's grids (see Milestone 96's audit) — 400x400
// covers that comfortably, including 2x pixel density.
export function getCardImageUrl(url) {
  return buildDerivativeUrl(url, { width: 400, height: 400, quality: 75 });
}

// Product detail page's large primary image, displayed at ~552px.
export function getDetailImageUrl(url) {
  return buildDerivativeUrl(url, { width: 800, height: 800, quality: 80 });
}

// Product detail gallery thumbnails — displayed at just 64px, the
// worst case Milestone 96 found (up to 1.6MB downloaded for a 64px
// thumbnail).
export function getGalleryThumbUrl(url) {
  return buildDerivativeUrl(url, { width: 200, height: 200, quality: 75 });
}
