// Milestone 203: regression coverage for the AI/search-visibility work
// that doesn't need a running server — pure file-content checks,
// matching the existing pattern of merchantFeed.test.mjs/
// staticRouteMetadata.test.mjs (both plain `node --test`, picked up
// automatically by `npm run test:feed`'s `scripts/*.test.mjs` glob).
//
// index.html's Organization JSON-LD sameAs array is a hand-typed
// static duplicate of businessInfo.js's social URLs (index.html is
// plain HTML, not JS — it can't import businessInfo.js at build time).
// That drift risk was flagged during this milestone's own investigation
// and had no test before now; this file closes it the same way
// backend/src/config/businessContact.test.ts already does for phone/
// email (read both files as text, compare the real values).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const indexHtml = readFileSync(join(REPO_ROOT, "index.html"), "utf8");
const businessInfoSource = readFileSync(join(REPO_ROOT, "src", "data", "businessInfo.js"), "utf8");

function businessInfoValue(key) {
  const match = businessInfoSource.match(new RegExp(`${key}:\\s*"([^"]+)"`));
  assert.ok(match, `${key} missing from businessInfo.js`);
  return match[1];
}

function extractOrganizationBlock(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const org = blocks.find((block) => block["@type"] === "Organization");
  assert.ok(org, "Organization JSON-LD block not found in index.html");
  return org;
}

test("index.html's Organization sameAs matches businessInfo.js's social URLs exactly", () => {
  const org = extractOrganizationBlock(indexHtml);
  const expected = [
    businessInfoValue("facebookUrl"),
    businessInfoValue("instagramUrl"),
    businessInfoValue("tiktokUrl"),
    businessInfoValue("xUrl"),
    businessInfoValue("linkedinUrl"),
    businessInfoValue("redditUrl"),
  ];
  assert.deepEqual(org.sameAs, expected);
});

test("index.html's Organization contactPoint uses the real, current phone and email", () => {
  const org = extractOrganizationBlock(indexHtml);
  assert.ok(org.contactPoint, "Organization JSON-LD is missing contactPoint");
  assert.equal(org.contactPoint.telephone, businessInfoValue("phoneE164"));
  assert.equal(org.contactPoint.email, businessInfoValue("email"));
  assert.equal(org.contactPoint["@type"], "ContactPoint");
});

test("index.html's Organization JSON-LD still declares no LocalBusiness, rating, review or FAQ markup", () => {
  const org = extractOrganizationBlock(indexHtml);
  assert.equal(org["@type"], "Organization");
  for (const forbidden of ["aggregateRating", "review", "openingHours", "geo"]) {
    assert.ok(!(forbidden in org), `Organization JSON-LD must not declare ${forbidden}`);
  }
});

test("robots.txt still allows the real search crawlers and keeps the private-route disallows", () => {
  const robotsTxt = readFileSync(join(REPO_ROOT, "public", "robots.txt"), "utf8");
  for (const agent of ["User-agent: *", "User-agent: Googlebot", "User-agent: Bingbot", "User-agent: OAI-SearchBot"]) {
    assert.ok(robotsTxt.includes(agent), `robots.txt missing ${agent}`);
  }
  // GPTBot is a training crawler, not a search crawler — this milestone
  // deliberately makes no owner-level training-data decision, so no
  // explicit GPTBot rule should exist in either direction.
  assert.ok(!/User-agent:\s*GPTBot/i.test(robotsTxt), "robots.txt must not add an explicit GPTBot rule without an owner decision");
  for (const disallow of ["Disallow: /admin", "Disallow: /cart", "Disallow: /checkout"]) {
    const occurrences = robotsTxt.split(disallow).length - 1;
    assert.ok(occurrences >= 4, `${disallow} should appear under every user-agent block (wildcard + 3 named), found ${occurrences}`);
  }
  assert.ok(robotsTxt.includes("Sitemap: https://www.seasonedzgroup.co.za/sitemap.xml"));
});

test("llms.txt exists, names the real business, and is honest about not affecting Google ranking", () => {
  const llmsTxt = readFileSync(join(REPO_ROOT, "public", "llms.txt"), "utf8");
  assert.ok(llmsTxt.includes("Seasonedz Group"));
  assert.ok(llmsTxt.includes("https://www.seasonedzgroup.co.za/shop/"));
  assert.ok(/does not affect google search ranking/i.test(llmsTxt), "llms.txt must not be allowed to drift into an implicit ranking claim");
});

test("the IndexNow key file in public/ matches the key the submission script actually uses", () => {
  const submitScript = readFileSync(join(REPO_ROOT, "scripts", "submit-indexnow.mjs"), "utf8");
  const keyMatch = submitScript.match(/INDEXNOW_KEY = "([0-9a-fA-F-]{8,128})"/);
  assert.ok(keyMatch, "Could not find INDEXNOW_KEY in submit-indexnow.mjs");
  const key = keyMatch[1];

  const keyFileContent = readFileSync(join(REPO_ROOT, "public", `${key}.txt`), "utf8").trim();
  assert.equal(keyFileContent, key, "public/<key>.txt content must equal the key itself, per the IndexNow protocol");
});

test("every category's relatedArticle points at a blog post that actually exists", () => {
  const categoryContentSource = readFileSync(join(REPO_ROOT, "src", "data", "categorySeoContent.js"), "utf8");
  const blogPostsSource = readFileSync(join(REPO_ROOT, "src", "data", "blogPosts.js"), "utf8");

  const relatedHrefs = [...categoryContentSource.matchAll(/relatedArticle:\s*\{\s*href:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(relatedHrefs.length > 0, "expected at least one category to declare a relatedArticle");

  for (const href of relatedHrefs) {
    const slug = href.replace(/^\/blog\//, "");
    assert.ok(blogPostsSource.includes(`slug: "${slug}"`), `relatedArticle href ${href} does not match any real blog post slug`);
  }
});

// Confirms no file under public/ (served verbatim, unlike src/) still
// contains the directory listing surprise of a second, stale IndexNow
// key file from an earlier run of this milestone's own work.
test("exactly one IndexNow key file exists in public/", () => {
  const publicDir = join(REPO_ROOT, "public");
  const keyFiles = readdirSync(publicDir).filter((name) => /^[0-9a-fA-F-]{8,128}\.txt$/.test(name) && statSync(join(publicDir, name)).isFile());
  assert.equal(keyFiles.length, 1, `expected exactly one IndexNow key file in public/, found: ${keyFiles.join(", ")}`);
});
