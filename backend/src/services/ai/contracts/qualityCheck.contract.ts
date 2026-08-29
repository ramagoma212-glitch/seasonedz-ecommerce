// Content Studio Phase 3A, brief section 23. This is the RESULT SHAPE
// only — qualityCheck.service.ts (one directory up) is the actual
// deterministic logic that produces one. The same shape is defined
// here as a validated contract because a future AI-based quality
// reviewer (brief section 23: "these checks will later be
// supplemented by AI quality review") will also need to return
// exactly this shape, validated the same way any other AI response is.
import { asObject, requireArrayOf, requireBoolean, requireEnum, requireString } from "./contractValidation.util.js";

const RESULT_CONTRACT = "QualityCheckResult";
const ISSUE_CONTRACT = "QualityCheckIssue";

export const QUALITY_ISSUE_SEVERITIES = ["ERROR", "WARNING"] as const;
export type QualityIssueSeverity = (typeof QUALITY_ISSUE_SEVERITIES)[number];

export interface QualityCheckIssue {
  // A short, stable machine code (e.g. "MISSING_CTA") — never a raw
  // sentence, so a future admin UI can group/filter by issue type.
  code: string;
  severity: QualityIssueSeverity;
  message: string;
  field: string | null;
}

export interface QualityCheckResult {
  passed: boolean;
  issues: QualityCheckIssue[];
  checkedAt: string;
  // Which check ruleset produced this — see promptVersions.ts.
  checkVersion: string;
}

function validateIssue(raw: unknown): QualityCheckIssue {
  const obj = asObject(raw, ISSUE_CONTRACT);
  const field = obj.field;
  if (field !== null && typeof field !== "string") {
    throw new Error(`${ISSUE_CONTRACT}.field: expected a string or null.`);
  }
  return {
    code: requireString(obj, "code", ISSUE_CONTRACT),
    severity: requireEnum(obj, "severity", QUALITY_ISSUE_SEVERITIES, ISSUE_CONTRACT),
    message: requireString(obj, "message", ISSUE_CONTRACT),
    field: field ?? null,
  };
}

export function validateQualityCheckResult(raw: unknown): QualityCheckResult {
  const obj = asObject(raw, RESULT_CONTRACT);
  return {
    passed: requireBoolean(obj, "passed", RESULT_CONTRACT),
    issues: requireArrayOf(obj, "issues", (item) => validateIssue(item), RESULT_CONTRACT),
    checkedAt: requireString(obj, "checkedAt", RESULT_CONTRACT),
    checkVersion: requireString(obj, "checkVersion", RESULT_CONTRACT),
  };
}
