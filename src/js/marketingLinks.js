// Milestone 185: stateless UTM campaign link builder for the Admin
// Marketing Link Builder (Metricool posts to Facebook/Instagram/
// TikTok reference these generated links; Metricool itself is never
// integrated with — see adminMarketingLinkBuilder.js's own header
// comment). Pure functions only: no network call, no backend endpoint,
// no database row. The generated link is a deterministic function of
// the fields on screen (Part J of the milestone brief).

export const SITE_URL = "https://www.seasonedzgroup.co.za";

export const SOURCE_PRESETS = ["facebook", "instagram", "tiktok"];
export const MEDIUM_PRESETS = ["social", "paid_social"];

// UTM values are always reduced to lowercase, underscore-separated,
// alphanumeric tokens (hyphens kept too, since they're common in real
// campaign names) — matches the milestone's own naming rules
// ("revised_books_launch_2026", "abc_video_01") and keeps every
// generated link free of spaces or punctuation that could get mangled
// once pasted into a Facebook/Instagram/TikTok post or Metricool.
export function sanitizeUtmValue(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

// Never silently changes the selected destination (brief's own naming
// rule) — a manual URL is used exactly as typed, only checked for
// being a genuine seasonedzgroup.co.za page; a preset destination
// always resolves to that real page's own canonical (trailing-slash)
// path, the same form scripts/generate-static-routes.mjs's sitemap
// uses, so a generated marketing link never costs an extra redirect
// hop the way a bare "/product/slug" link would.
export function resolveDestinationUrl({ destinationType, productSlug, categorySlug, blogSlug, manualUrl }) {
  switch (destinationType) {
    case "home":
      return { url: `${SITE_URL}/` };
    case "shop":
      return { url: `${SITE_URL}/shop/` };
    case "product":
      return productSlug ? { url: `${SITE_URL}/product/${productSlug}/` } : { error: "Choose a product." };
    case "category":
      return categorySlug ? { url: `${SITE_URL}/category/${categorySlug}/` } : { error: "Choose a category." };
    case "blog":
      return blogSlug ? { url: `${SITE_URL}/blog/${blogSlug}/` } : { error: "Choose a blog post." };
    case "manual": {
      const trimmed = String(manualUrl ?? "").trim();
      if (!trimmed) return { error: "Enter a Seasonedz page URL." };
      let resolved;
      try {
        resolved = trimmed.startsWith("/") ? new URL(trimmed, SITE_URL) : new URL(trimmed);
      } catch {
        return { error: "Enter a valid URL." };
      }
      if (resolved.origin !== new URL(SITE_URL).origin) {
        return { error: "Only seasonedzgroup.co.za pages are allowed — external domains are rejected." };
      }
      return { url: resolved.href };
    }
    default:
      return { error: "Choose a destination." };
  }
}

// The one function the admin page's live-preview handler calls.
// Returns { url } on success or { errors: [...] } — never throws.
// Existing query parameters on a manual destination URL (e.g.
// "/shop?category=bundles") are preserved: utm_* params are added
// alongside them via URLSearchParams, never a wholesale rewrite.
export function buildMarketingLink({ destinationType, productSlug, categorySlug, blogSlug, manualUrl, source, medium, campaign, content, term }) {
  const errors = [];

  const destination = resolveDestinationUrl({ destinationType, productSlug, categorySlug, blogSlug, manualUrl });
  if (destination.error) errors.push(destination.error);

  const cleanSource = sanitizeUtmValue(source);
  if (!cleanSource) errors.push("Source is required.");

  const cleanMedium = sanitizeUtmValue(medium);
  if (!MEDIUM_PRESETS.includes(cleanMedium)) errors.push("Choose a medium (social or paid_social).");

  const cleanCampaign = sanitizeUtmValue(campaign);
  if (!cleanCampaign) errors.push("Campaign is required.");

  const cleanContent = sanitizeUtmValue(content);
  const cleanTerm = sanitizeUtmValue(term);

  if (errors.length > 0) return { errors };

  const url = new URL(destination.url);
  url.searchParams.set("utm_source", cleanSource);
  url.searchParams.set("utm_medium", cleanMedium);
  url.searchParams.set("utm_campaign", cleanCampaign);
  if (cleanContent) url.searchParams.set("utm_content", cleanContent);
  if (cleanTerm) url.searchParams.set("utm_term", cleanTerm);

  return { url: url.href };
}
