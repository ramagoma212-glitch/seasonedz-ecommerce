import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePlatformVariant, validateCaptionPackage, validateVideoScript, validateVisualBrief } from "./creativeOutputs.contract.js";

function validVariant(overrides: Record<string, unknown> = {}) {
  return { platform: "INSTAGRAM", caption: "A caption.", hashtags: ["#Seasonedz"], callToAction: "Shop now", ...overrides };
}

test("PlatformVariant: accepts a valid variant", () => {
  const variant = validatePlatformVariant(validVariant());
  assert.equal(variant.platform, "INSTAGRAM");
});

test("PlatformVariant: rejects an unknown platform", () => {
  assert.throws(() => validatePlatformVariant(validVariant({ platform: "PINTEREST" })));
});

function validCaptionPackage(overrides: Record<string, unknown> = {}) {
  return {
    masterCaption: "A master caption.",
    platformVariants: [validVariant(), validVariant({ platform: "FACEBOOK" })],
    callToAction: "Shop now",
    hashtags: ["#Seasonedz"],
    destinationUrl: null,
    ...overrides,
  };
}

test("CaptionPackage: accepts a valid package with multiple platform variants", () => {
  const pkg = validateCaptionPackage(validCaptionPackage());
  assert.equal(pkg.platformVariants.length, 2);
});

test("CaptionPackage: rejects a malformed platform variant inside the array", () => {
  assert.throws(() => validateCaptionPackage(validCaptionPackage({ platformVariants: [{ platform: "INSTAGRAM" }] })));
});

function validScene(overrides: Record<string, unknown> = {}) {
  return { sceneNumber: 1, durationSeconds: 5, visual: "Product on table", action: "Hands open it", cameraDirection: null, voiceover: null, onScreenText: null, ...overrides };
}

function validScript(overrides: Record<string, unknown> = {}) {
  return {
    title: "A calm afternoon",
    duration: 20,
    hook: { spokenHook: "x", visualHook: "y", textOverlayHook: null, hookType: "STORY", targetAudience: "Parents", reason: "z" },
    scenes: [validScene()],
    voiceover: "Full script voiceover.",
    onScreenText: "Shop now",
    productReference: null,
    callToAction: "Shop now",
    ...overrides,
  };
}

test("VideoScript: accepts a valid script with one scene", () => {
  const script = validateVideoScript(validScript());
  assert.equal(script.scenes.length, 1);
});

test("VideoScript: rejects a scene missing durationSeconds", () => {
  const scene = validScene();
  delete (scene as Record<string, unknown>).durationSeconds;
  assert.throws(() => validateVideoScript(validScript({ scenes: [scene] })));
});

function validVisualBrief(overrides: Record<string, unknown> = {}) {
  return {
    subject: "Product in use",
    environment: "Home",
    composition: "Clean",
    cameraPosition: "Eye level",
    cameraMovement: "Static",
    lighting: "Natural",
    visualStyle: "Warm",
    action: "Using the product",
    emotion: "Calm",
    pacing: "Slow",
    aspectRatio: "9:16",
    duration: 20,
    brandDirection: "Andika font, real logo only",
    realProductRequired: true,
    productAssetIds: ["asset-1"],
    textOverlayRequirements: "Minimal",
    continuityRequirements: "Product looks identical every shot",
    negativeInstructions: "No invented packaging",
    safetyRequirements: "No unapproved claim",
    ...overrides,
  };
}

test("VisualBrief: accepts a fully specified brief, never vague", () => {
  const brief = validateVisualBrief(validVisualBrief());
  assert.equal(brief.realProductRequired, true);
});

test("VisualBrief: rejects realProductRequired that isn't a boolean", () => {
  assert.throws(() => validateVisualBrief(validVisualBrief({ realProductRequired: "yes" })));
});

test("VisualBrief: rejects a missing negativeInstructions field", () => {
  const input = validVisualBrief();
  delete (input as Record<string, unknown>).negativeInstructions;
  assert.throws(() => validateVisualBrief(input));
});
