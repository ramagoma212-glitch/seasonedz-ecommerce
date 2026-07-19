// Small, dependency-free helpers for turning Express query-string values
// (req.query entries can be string | string[] | ParsedQs | ParsedQs[] |
// undefined) into the plain strings/numbers the product/category services
// expect. Every helper is defensive: an unexpected shape is treated as
// "not provided" rather than thrown — the one exception is price, which
// reports back a clean error message instead of silently ignoring a
// value someone clearly meant to filter by (see parsePriceParam).

export type SortOption = "featured" | "price-asc" | "price-desc" | "rating" | "newest" | "name-asc";
export type StockOption = "in-stock" | "out-of-stock";

const SORT_OPTIONS: readonly SortOption[] = ["featured", "price-asc", "price-desc", "rating", "newest", "name-asc"];
const STOCK_OPTIONS: readonly StockOption[] = ["in-stock", "out-of-stock"];
export const DEFAULT_SORT: SortOption = "featured";

function firstValue(raw: unknown): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value : undefined;
}

export function parseStringParam(raw: unknown): string | undefined {
  const value = firstValue(raw)?.trim();
  return value ? value : undefined;
}

// Slugs and tag names are stored lowercase in the seed data and by
// convention everywhere else, so lowercasing the query value makes the
// filter forgiving of casing without risking a mismatch.
export function parseSlugParam(raw: unknown): string | undefined {
  return parseStringParam(raw)?.toLowerCase();
}

export interface NumberParamResult {
  value?: number;
  error?: string;
}

export function parsePriceParam(raw: unknown, label: string): NumberParamResult {
  const value = firstValue(raw)?.trim();
  if (!value) {
    return {};
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { error: `${label} must be a non-negative number` };
  }

  return { value: parsed };
}

// An unrecognised sort falls back to the default rather than erroring —
// unlike price, a typo'd sort still produces a perfectly valid (if not
// specifically sorted) product list, so failing the whole request would
// be overly strict.
export function parseSortParam(raw: unknown): SortOption {
  const value = parseStringParam(raw);
  return value && (SORT_OPTIONS as readonly string[]).includes(value) ? (value as SortOption) : DEFAULT_SORT;
}

// Same reasoning as sort: an unrecognised stock value is treated as "no
// stock filter" rather than an error.
export function parseStockParam(raw: unknown): StockOption | undefined {
  const value = parseStringParam(raw);
  return value && (STOCK_OPTIONS as readonly string[]).includes(value) ? (value as StockOption) : undefined;
}

// Version 7, Milestone 59: pagination for admin list endpoints (orders,
// enquiries). Same forgiving convention as sort/stock above — anything
// that isn't a positive integer is treated as "not provided" (the
// caller applies its own default) rather than erroring, since a typo'd
// page/limit value shouldn't fail the whole request.
export function parsePositiveIntParam(raw: unknown): number | undefined {
  const value = parseStringParam(raw);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
