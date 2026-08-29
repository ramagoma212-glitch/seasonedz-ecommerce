import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCaptionPackageQuality, checkContentIdeaQuality } from "./qualityCheck.service.js";
import type { CaptionPackage } from "./contracts/creativeOutputs.contract.js";
import type { ContentIdea } from "./contracts/contentIdea.contract.js";

function validCaptionPackage(overrides: Partial<CaptionPackage> = {}): CaptionPackage {
  return {
    masterCaption: "A few quiet minutes with this colouring book.",
    platformVariants: [
      { platform: "INSTAGRAM", caption: "A few quiet minutes, screen free.", hashtags: ["#Seasonedz"], callToAction: "Shop now" },
      { platform: "FACEBOOK", caption: "A calm afternoon activity for the whole family.", hashtags: [], callToAction: "Shop now at Seasonedz Group" },
    ],
    callToAction: "Shop now",
    hashtags: ["#Seasonedz"],
    destinationUrl: null,
    ...overrides,
  };
}

test("passes a genuinely well-formed caption package", () => {
  const result = checkCaptionPackageQuality(validCaptionPackage(), { requiredPlatforms: ["INSTAGRAM", "FACEBOOK"], approvedClaims: [] });
  assert.equal(result.passed, true);
  assert.equal(result.issues.length, 0);
});

test("fails on an empty master caption", () => {
  const result = checkCaptionPackageQuality(validCaptionPackage({ masterCaption: "   " }), { requiredPlatforms: [], approvedClaims: [] });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => issue.code === "EMPTY_CAPTION"));
});

test("fails on a missing call to action", () => {
  const result = checkCaptionPackageQuality(validCaptionPackage({ callToAction: "" }), { requiredPlatforms: [], approvedClaims: [] });
  assert.ok(result.issues.some((issue) => issue.code === "MISSING_CTA"));
});

test("fails when a required platform has no variant", () => {
  const result = checkCaptionPackageQuality(validCaptionPackage(), { requiredPlatforms: ["INSTAGRAM", "TIKTOK"], approvedClaims: [] });
  assert.ok(result.issues.some((issue) => issue.code === "MISSING_PLATFORM_VARIANT" && issue.field === "platformVariants"));
});

test("warns when every platform variant is identical to the master caption (never blindly copied)", () => {
  const pkg = validCaptionPackage({
    masterCaption: "Same text everywhere.",
    platformVariants: [
      { platform: "INSTAGRAM", caption: "Same text everywhere.", hashtags: [], callToAction: "Shop now" },
      { platform: "FACEBOOK", caption: "Same text everywhere.", hashtags: [], callToAction: "Shop now" },
    ],
  });
  const result = checkCaptionPackageQuality(pkg, { requiredPlatforms: [], approvedClaims: [] });
  assert.ok(result.issues.some((issue) => issue.code === "DUPLICATE_CAPTION_ACROSS_PLATFORMS"));
});

test("flags a decorative em dash in the master caption", () => {
  const result = checkCaptionPackageQuality(validCaptionPackage({ masterCaption: "A calm activity — perfect for families." }), { requiredPlatforms: [], approvedClaims: [] });
  assert.ok(result.issues.some((issue) => issue.code === "DECORATIVE_DASH"));
});

test("flags the US spelling 'coloring'", () => {
  const result = checkCaptionPackageQuality(validCaptionPackage({ masterCaption: "A relaxing coloring activity." }), { requiredPlatforms: [], approvedClaims: [] });
  assert.ok(result.issues.some((issue) => issue.code === "US_SPELLING"));
});

test("never flags the correct British spelling 'colouring'", () => {
  const result = checkCaptionPackageQuality(validCaptionPackage({ masterCaption: "A relaxing colouring activity." }), { requiredPlatforms: [], approvedClaims: [] });
  assert.ok(!result.issues.some((issue) => issue.code === "US_SPELLING"));
});

test("flags a risky claim phrase not present in this content's own approved claims", () => {
  const result = checkCaptionPackageQuality(validCaptionPackage({ masterCaption: "Our award-winning colouring book." }), { requiredPlatforms: [], approvedClaims: [] });
  assert.ok(result.issues.some((issue) => issue.code === "UNSUPPORTED_CLAIM_PHRASE"));
});

test("does not flag a risky claim phrase that IS present in this content's own approved claims", () => {
  const result = checkCaptionPackageQuality(validCaptionPackage({ masterCaption: "Our award-winning colouring book." }), { requiredPlatforms: [], approvedClaims: ["Award-winning packaging design"] });
  assert.ok(!result.issues.some((issue) => issue.code === "UNSUPPORTED_CLAIM_PHRASE"));
});

function validIdea(overrides: Partial<ContentIdea> = {}): ContentIdea {
  return {
    title: "A calm afternoon",
    concept: "Real use at home.",
    hook: { spokenHook: "x", visualHook: "y", textOverlayHook: null, hookType: "STORY", targetAudience: "Parents", reason: "z" },
    pillar: "Educational Colouring",
    targetAudience: "Parents",
    productId: "prod-1",
    contentType: "Instagram Reel",
    platformSuitability: ["INSTAGRAM"],
    marketingAngle: "Everyday use",
    callToAction: "Shop now",
    whyThisIdea: "Relevant",
    noveltySignals: ["angle-1"],
    ...overrides,
  };
}

test("ContentIdea quality: fails when a product reference is required but missing", () => {
  const result = checkContentIdeaQuality(validIdea({ productId: null }), { requireProductReference: true, approvedClaims: [] });
  assert.ok(result.issues.some((issue) => issue.code === "MISSING_PRODUCT_REFERENCE"));
});

test("ContentIdea quality: passes when a product reference is not required and absent", () => {
  const result = checkContentIdeaQuality(validIdea({ productId: null }), { requireProductReference: false, approvedClaims: [] });
  assert.equal(result.passed, true);
});
