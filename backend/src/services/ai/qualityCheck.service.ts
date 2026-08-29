// Content Studio Phase 3A, brief sections 23-24: deterministic quality
// checks that require no AI call at all. "Invalid Product ID",
// "inactive audience" and "inactive pillar" are deliberately NOT
// re-checked here — contentContext.service.ts's reference validators
// already reject those before a context (and therefore any generated
// content) can exist at all, so duplicating the check here would only
// ever be dead code. Everything else the brief asks for operates on
// already-generated structured content and lives in this file.

import { EM_DASH, EN_DASH } from "../../utils/copyRules.js";
import { PROMPT_VERSIONS } from "./promptVersions.js";
import type { QualityCheckIssue, QualityCheckResult } from "./contracts/qualityCheck.contract.js";
import type { CaptionPackage, Platform } from "./contracts/creativeOutputs.contract.js";
import type { ContentIdea } from "./contracts/contentIdea.contract.js";

function buildResult(issues: QualityCheckIssue[]): QualityCheckResult {
  return {
    passed: issues.every((issue) => issue.severity !== "ERROR"),
    issues,
    checkedAt: new Date().toISOString(),
    checkVersion: PROMPT_VERSIONS.QUALITY_CHECK,
  };
}

// Milestone 177's own brand writing rule, applied here to future
// generated content the same way it already applies to every
// human-written string in this codebase: no decorative em/en dash,
// and British/SA spelling only. utils/copyRules.ts holds the two
// character constants this file uses; the frontend's own
// tests/smoke/copyAudit.spec.js enforces the identical rule
// independently, since frontend and backend are separate packages
// with no shared module between them.
function checkTextRules(text: string, field: string): QualityCheckIssue[] {
  const issues: QualityCheckIssue[] = [];
  if (text.includes(EM_DASH) || text.includes(EN_DASH)) {
    issues.push({ code: "DECORATIVE_DASH", severity: "WARNING", message: `"${field}" contains a decorative em or en dash — prefer a full stop or comma.`, field });
  }
  if (/\bcoloring\b/i.test(text)) {
    issues.push({ code: "US_SPELLING", severity: "WARNING", message: `"${field}" uses the US spelling "coloring" — Seasonedz always uses "colouring".`, field });
  }
  return issues;
}

const RISKY_CLAIM_PHRASES = ["award-winning", "award winning", "certified", "guaranteed", "clinically proven", "#1 rated", "number one rated", "as seen on"];

// Deliberately a WARNING, never an ERROR — a substring match cannot
// determine on its own whether a claim is genuinely unsupported (it
// might be listed in this exact context's own approvedClaims). This
// is a flag for human review, not an automatic block (brief section
// 24: "quality check should fail or flag it").
function checkRiskyClaimPhrases(text: string, field: string, approvedClaims: string[]): QualityCheckIssue[] {
  const lower = text.toLowerCase();
  const approvedLower = approvedClaims.map((claim) => claim.toLowerCase());
  const issues: QualityCheckIssue[] = [];
  for (const phrase of RISKY_CLAIM_PHRASES) {
    if (lower.includes(phrase) && !approvedLower.some((claim) => claim.includes(phrase))) {
      issues.push({ code: "UNSUPPORTED_CLAIM_PHRASE", severity: "WARNING", message: `"${field}" contains the phrase "${phrase}", which is not present in this content's own approved claims.`, field });
    }
  }
  return issues;
}

export interface CaptionQualityOptions {
  requiredPlatforms: Platform[];
  approvedClaims: string[];
}

export function checkCaptionPackageQuality(pkg: CaptionPackage, options: CaptionQualityOptions): QualityCheckResult {
  const issues: QualityCheckIssue[] = [];

  if (pkg.masterCaption.trim().length === 0) {
    issues.push({ code: "EMPTY_CAPTION", severity: "ERROR", message: "masterCaption is empty.", field: "masterCaption" });
  }
  if (pkg.callToAction.trim().length === 0) {
    issues.push({ code: "MISSING_CTA", severity: "ERROR", message: "callToAction is empty.", field: "callToAction" });
  }

  for (const platform of options.requiredPlatforms) {
    if (!pkg.platformVariants.some((variant) => variant.platform === platform)) {
      issues.push({ code: "MISSING_PLATFORM_VARIANT", severity: "ERROR", message: `No platform variant was generated for ${platform}.`, field: "platformVariants" });
    }
  }

  const identicalToMaster = pkg.platformVariants.filter((variant) => variant.caption.trim() === pkg.masterCaption.trim());
  if (pkg.platformVariants.length > 1 && identicalToMaster.length === pkg.platformVariants.length) {
    issues.push({ code: "DUPLICATE_CAPTION_ACROSS_PLATFORMS", severity: "WARNING", message: "Every platform variant is identical to the master caption — captions should be adapted per platform, not copied.", field: "platformVariants" });
  }

  issues.push(...checkTextRules(pkg.masterCaption, "masterCaption"));
  issues.push(...checkRiskyClaimPhrases(pkg.masterCaption, "masterCaption", options.approvedClaims));
  for (const variant of pkg.platformVariants) {
    issues.push(...checkTextRules(variant.caption, `platformVariants.${variant.platform}.caption`));
    issues.push(...checkRiskyClaimPhrases(variant.caption, `platformVariants.${variant.platform}.caption`, options.approvedClaims));
  }

  return buildResult(issues);
}

export interface ContentIdeaQualityOptions {
  requireProductReference: boolean;
  approvedClaims: string[];
}

export function checkContentIdeaQuality(idea: ContentIdea, options: ContentIdeaQualityOptions): QualityCheckResult {
  const issues: QualityCheckIssue[] = [];

  if (idea.callToAction.trim().length === 0) {
    issues.push({ code: "MISSING_CTA", severity: "ERROR", message: "callToAction is empty.", field: "callToAction" });
  }
  if (options.requireProductReference && !idea.productId) {
    issues.push({ code: "MISSING_PRODUCT_REFERENCE", severity: "ERROR", message: "This idea requires a product reference, but none was set.", field: "productId" });
  }

  issues.push(...checkTextRules(idea.title, "title"));
  issues.push(...checkTextRules(idea.concept, "concept"));
  issues.push(...checkRiskyClaimPhrases(idea.concept, "concept", options.approvedClaims));

  return buildResult(issues);
}
