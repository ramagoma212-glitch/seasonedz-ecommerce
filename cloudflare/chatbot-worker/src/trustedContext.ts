// Milestone 187, Part I: builds the ONLY factual context the AI is
// allowed to answer from. Two kinds of source:
//
// 1. LIVE, authoritative data — fetched from the same real public API
//    the website itself uses (never a private/admin endpoint), so
//    prices/stock/preorder status can never go stale in the prompt.
//    Cached in-memory (module scope) for ~5 minutes to avoid hammering
//    the API on every chat message — this is a plain per-isolate
//    variable, not a new Cloudflare primitive, so it resets on a cold
//    start; that's fine, it just means an occasional extra fetch, never
//    stale data served past its TTL.
//
// 2. Mirrored static facts (business contact details, delivery fee
//    rules, a condensed returns-policy summary) — the same "kept in
//    sync by hand, cross-referenced in a comment" pattern this project
//    already uses between src/config/delivery.js and
//    backend/src/config/delivery.ts. Sourced from:
//      - src/data/businessInfo.js (contact details)
//      - src/config/delivery.js (fees/thresholds)
//      - src/pages/returnsPolicy.js (condensed — the real policy has no
//        single universal return window; see the condensed summary's
//        own comment below for why it's deliberately not simplified to
//        one number)

const PRODUCTS_API_URL = "https://api.seasonedzgroup.co.za/api/products";
const CATEGORIES_API_URL = "https://api.seasonedzgroup.co.za/api/categories";
const PREORDER_SETTINGS_API_URL = "https://api.seasonedzgroup.co.za/api/preorder/settings";

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedContext {
  text: string;
  expiresAt: number;
}

let cache: CachedContext | null = null;

// Mirrors src/data/businessInfo.js exactly — public contact details
// only, nothing else from that file is relevant to the assistant.
const BUSINESS_INFO = {
  name: "Seasonedz Group",
  website: "https://www.seasonedzgroup.co.za",
  email: "seasonedzgroup@outlook.com",
  phone: "069 526 9941",
  whatsapp: "https://wa.me/27695269941",
  location: "Pretoria, South Africa",
};

// Mirrors src/config/delivery.js exactly (COURIER_LOCKER_FEE=100,
// COURIER_DOOR_FEE=120, FREE_DELIVERY_THRESHOLD=600,
// REGISTERED_FREE_DELIVERY_THRESHOLD=500, COLLECTION_FEE=0,
// COLLECTION_CITIES=[Pretoria, Thohoyandou]) — update both together if
// the real rule ever changes.
const DELIVERY_SUMMARY = `Delivery within South Africa: Courier Guy Locker to Locker costs R100, Courier Guy Door to Door costs R120. Both are free once a guest customer's qualifying physical-product subtotal reaches R600, or once a signed-in registered customer's qualifying subtotal reaches R500. Customer Collection is always free, available in Pretoria or Thohoyandou by arrangement. Gift wrapping and digital products never count toward these thresholds. No specific delivery date is promised — delivery is arranged manually and timing is an estimate only.`;

// Condensed from src/pages/returnsPolicy.js's real 23-section policy —
// deliberately not simplified to one universal number, since the real
// policy genuinely has different rules for books versus other
// products, matching Part I's own "do not invent one universal return
// period" instruction. The assistant is told (systemPrompt.ts) to
// direct anything more specific to the real Returns Policy page or
// support.
const RETURNS_SUMMARY = `Returns: damaged, defective or incorrectly supplied products can be returned or replaced, in line with the Consumer Protection Act (a 6-month quality warranty applies to defects). Most other physical, non-book products bought online qualify for a 7-day change-of-mind return under the Electronic Communications and Transactions Act. Books and colouring books are excluded from that 7-day change-of-mind right by law, but an unused, uncoloured, undamaged book may still be accepted back as a goodwill return if approved first. Digital products cannot be returned for change of mind once downloaded, but a broken or wrong file will be fixed or refunded. The full Returns, Refunds and Exchanges Policy is at https://www.seasonedzgroup.co.za/returns-policy/.`;

interface ApiProduct {
  name: string;
  slug: string;
  price: number;
  stockStatus: string;
  productType: string;
  isPreorder: boolean;
  preorderReleaseAt: string | null;
  category?: { name: string } | null;
  shortDescription?: string;
}

interface ApiCategory {
  name: string;
  slug: string;
  productCount: number;
}

interface PreorderSettings {
  firstRegisteredPreorderDiscountEnabled: boolean;
  firstRegisteredPreorderDiscountPercent: number;
  minimumEligiblePreorderSubtotal: number;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const body = (await response.json()) as { success?: boolean; data?: T };
    if (!body || body.success === false) return null;
    return body.data ?? null;
  } catch {
    return null;
  }
}

function summariseProducts(products: ApiProduct[]): string {
  if (products.length === 0) return "Product list is temporarily unavailable.";
  return products
    .map((p) => {
      const availability = p.isPreorder
        ? `preorder${p.preorderReleaseAt ? `, available from ${new Date(p.preorderReleaseAt).toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg" })}` : ""}`
        : p.stockStatus === "Out of Stock"
          ? "out of stock"
          : "in stock";
      const category = p.category?.name ? ` (${p.category.name})` : "";
      return `- ${p.name}${category}: R${Number(p.price).toFixed(2)}, ${availability}. URL: https://www.seasonedzgroup.co.za/product/${p.slug}/`;
    })
    .join("\n");
}

function summariseCategories(categories: ApiCategory[]): string {
  const withProducts = categories.filter((c) => c.productCount > 0);
  if (withProducts.length === 0) return "";
  return withProducts.map((c) => `- ${c.name}: https://www.seasonedzgroup.co.za/category/${c.slug}/`).join("\n");
}

function summarisePreorder(settings: PreorderSettings | null): string {
  if (!settings || !settings.firstRegisteredPreorderDiscountEnabled) {
    return "Preorder products are clearly marked. No first-preorder discount is currently active.";
  }
  return `Preorder products are clearly marked with their real release date. A registered customer's first qualifying preorder gets ${settings.firstRegisteredPreorderDiscountPercent}% off when eligible preorder items total at least R${settings.minimumEligiblePreorderSubtotal} — this only applies once per customer and only to registered accounts, never guests.`;
}

async function buildFreshContext(): Promise<string> {
  const [products, categories, preorderSettings] = await Promise.all([
    fetchJson<{ products: ApiProduct[] }>(PRODUCTS_API_URL),
    fetchJson<{ categories: ApiCategory[] }>(CATEGORIES_API_URL),
    fetchJson<PreorderSettings>(PREORDER_SETTINGS_API_URL),
  ]);

  const productLines = summariseProducts(products?.products ?? []);
  const categoryLines = summariseCategories(categories?.categories ?? []);
  const preorderLine = summarisePreorder(preorderSettings);

  return [
    `SEASONEDZ GROUP — trusted facts. Answer only from this information.`,
    ``,
    `Business: ${BUSINESS_INFO.name}, based in ${BUSINESS_INFO.location}. Website: ${BUSINESS_INFO.website}. Email: ${BUSINESS_INFO.email}. Phone/WhatsApp: ${BUSINESS_INFO.phone} (${BUSINESS_INFO.whatsapp}).`,
    ``,
    `Current products (real prices and availability, ZAR):`,
    productLines,
    ``,
    categoryLines ? `Categories:\n${categoryLines}\n` : "",
    `Preorders: ${preorderLine}`,
    ``,
    `${DELIVERY_SUMMARY}`,
    ``,
    `${RETURNS_SUMMARY}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function getTrustedContext(): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.text;

  const text = await buildFreshContext();
  cache = { text, expiresAt: now + CACHE_TTL_MS };
  return text;
}
