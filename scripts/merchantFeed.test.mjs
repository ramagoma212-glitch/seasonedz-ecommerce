// Version 7, Milestone 171I.1: unit tests for the Google Merchant
// Center feed generator's product identifier logic — the part of this
// milestone's own audit that's genuinely unit-testable without needing
// the live API (buildMerchantFeedXml() is a pure function of whatever
// product array it's given). Uses Node's built-in test runner directly
// (no new dependency), same discipline as every backend *.test.ts file
// in this project, just applied to this frontend-adjacent build
// script. Run via `npm run test:feed`.
//
// The live-data-only integration checks (real feed content, no fake
// GTIN in what's actually published today, .co.za URLs, valid XML)
// stay in tests/smoke/nonBrandedSeo.spec.js, which fetches the real
// built dist/google-merchant-feed.xml — this file is specifically
// about proving the identifier PRIORITY LOGIC itself is correct,
// including the gtin path, which is dormant in production today (no
// product in the authoritative database has a gtin field yet — see
// this milestone's own final report) but must still be verified
// correct for whenever real ISBN/GTIN data is added.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMerchantFeedXml, escapeXml } from "./generate-static-routes.mjs";

function baseProduct(overrides = {}) {
  return {
    slug: "test-product",
    name: "Test Product",
    shortDescription: "A genuine test product description.",
    image: "https://example.supabase.co/storage/product.png",
    stockStatus: "In Stock",
    price: 100,
    category: { name: "Test Category" },
    sku: "SG-TEST-1",
    ...overrides,
  };
}

test("a product with a genuine SKU (no gtin) emits g:mpn, never g:gtin or identifier_exists", () => {
  const xml = buildMerchantFeedXml([baseProduct({ sku: "SG-0001" })]);
  assert.match(xml, /<g:mpn>SG-0001<\/g:mpn>/);
  assert.doesNotMatch(xml, /<g:gtin>/);
  assert.doesNotMatch(xml, /<g:identifier_exists>/);
});

test("a product with neither sku nor gtin emits identifier_exists=no, never a fabricated mpn or gtin", () => {
  const xml = buildMerchantFeedXml([baseProduct({ sku: null })]);
  assert.match(xml, /<g:identifier_exists>no<\/g:identifier_exists>/);
  assert.doesNotMatch(xml, /<g:mpn>/);
  assert.doesNotMatch(xml, /<g:gtin>/);
});

test("a product with a genuine gtin (e.g. a real ISBN-13) emits g:gtin and never mpn or identifier_exists — GTIN always wins when it genuinely exists", () => {
  const xml = buildMerchantFeedXml([baseProduct({ gtin: "9780123456789", sku: "SG-0001" })]);
  assert.match(xml, /<g:gtin>9780123456789<\/g:gtin>/);
  assert.doesNotMatch(xml, /<g:mpn>/);
  assert.doesNotMatch(xml, /<g:identifier_exists>/);
});

test("a gtin with human-entered hyphens is normalised to digits only — never altering the actual identifier value", () => {
  const xml = buildMerchantFeedXml([baseProduct({ gtin: "978-0-123456-78-9" })]);
  assert.match(xml, /<g:gtin>9780123456789<\/g:gtin>/);
});

test("two different products never share the same emitted identifier, and no product id is duplicated", () => {
  const xml = buildMerchantFeedXml([
    baseProduct({ slug: "product-a", sku: "SG-0001" }),
    baseProduct({ slug: "product-b", sku: "SG-0002" }),
  ]);
  const ids = [...xml.matchAll(/<g:id>(.*?)<\/g:id>/g)].map((m) => m[1]);
  const mpns = [...xml.matchAll(/<g:mpn>(.*?)<\/g:mpn>/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(mpns).size, mpns.length);
});

test("a bundle product (no identifier of its own) never inherits an identifier from an unrelated product — each item's fields come only from that item's own data", () => {
  const bundle = baseProduct({ slug: "bible-book-and-markers-bundle", sku: "SG-0008", gtin: undefined });
  const standaloneBook = baseProduct({ slug: "standalone-bible-book", sku: "SG-0003", gtin: "9781234567897" });
  const xml = buildMerchantFeedXml([bundle, standaloneBook]);

  const items = xml.split("<item>").slice(1);
  const bundleItem = items.find((item) => item.includes("bible-book-and-markers-bundle"));
  const bookItem = items.find((item) => item.includes("standalone-bible-book"));

  assert.doesNotMatch(bundleItem, /<g:gtin>/, "the bundle must never carry the standalone book's ISBN");
  assert.match(bundleItem, /<g:mpn>SG-0008<\/g:mpn>/);
  assert.match(bookItem, /<g:gtin>9781234567897<\/g:gtin>/);
});

test("physical and digital editions of conceptually the same product never share an identifier — each product's own gtin field is used independently", () => {
  const physicalEdition = baseProduct({ slug: "physical-book", productType: "PHYSICAL", gtin: "9781111111111" });
  const digitalEdition = baseProduct({ slug: "digital-book", productType: "DIGITAL", gtin: "9782222222222" });
  const xml = buildMerchantFeedXml([physicalEdition, digitalEdition]);

  const items = xml.split("<item>").slice(1);
  const physicalItem = items.find((item) => item.includes("physical-book"));
  const digitalItem = items.find((item) => item.includes("digital-book"));

  assert.match(physicalItem, /<g:gtin>9781111111111<\/g:gtin>/);
  assert.match(digitalItem, /<g:gtin>9782222222222<\/g:gtin>/);
  assert.doesNotMatch(physicalItem, /9782222222222/);
  assert.doesNotMatch(digitalItem, /9781111111111/);
});

test("feed price matches the product's own price exactly, in ZAR, with no delivery fee folded in", () => {
  const xml = buildMerchantFeedXml([baseProduct({ price: 169.5 })]);
  assert.match(xml, /<g:price>169\.50 ZAR<\/g:price>/);
});

test("feed availability reflects the product's own stock state exactly — Out of Stock is never emitted as in stock", () => {
  const inStockXml = buildMerchantFeedXml([baseProduct({ stockStatus: "In Stock" })]);
  assert.match(inStockXml, /<g:availability>in stock<\/g:availability>/);

  const outOfStockXml = buildMerchantFeedXml([baseProduct({ stockStatus: "Out of Stock" })]);
  assert.match(outOfStockXml, /<g:availability>out of stock<\/g:availability>/);
});

test("every feed product link uses the canonical .co.za domain, never .com/github.io/onrender.com", () => {
  const xml = buildMerchantFeedXml([baseProduct({ slug: "abc-colouring-book-for-kids-with-fun-facts" })]);
  assert.match(xml, /<link>https:\/\/www\.seasonedzgroup\.co\.za\/product\/abc-colouring-book-for-kids-with-fun-facts\/<\/link>/);
  assert.doesNotMatch(xml, /seasonedzgroup\.com/);
  assert.doesNotMatch(xml, /github\.io/);
  assert.doesNotMatch(xml, /onrender\.com/);
});

test("brand is always the genuine Seasonedz Group identity — never a third-party or invented brand", () => {
  const xml = buildMerchantFeedXml([baseProduct()]);
  assert.match(xml, /<g:brand>Seasonedz Group<\/g:brand>/);
});

test("special characters in title/description/mpn are XML-escaped, producing valid, well-formed markup", () => {
  const xml = buildMerchantFeedXml([baseProduct({ name: 'Kids & "Fun" Book <Special>', sku: "N&M" })]);
  assert.match(xml, /Kids &amp; &quot;Fun&quot; Book &lt;Special&gt;/);
  assert.match(xml, /<g:mpn>N&amp;M<\/g:mpn>/);
  assert.doesNotMatch(xml, /Kids & "Fun"/);
});

test("escapeXml handles every reserved XML character correctly", () => {
  assert.equal(escapeXml(`& < > " '`), "&amp; &lt; &gt; &quot; &apos;");
});
