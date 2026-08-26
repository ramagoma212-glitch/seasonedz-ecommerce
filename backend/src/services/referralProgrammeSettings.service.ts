// Version 7, Milestone 172B.3: the one authoritative, admin-editable
// source of truth for Seasonedz's own affiliate programme rates — see
// AffiliateProgrammeSettings' own schema comment for why this is a
// database row rather than a config/*.ts constant. Deterministic
// singleton: getSettings() always returns the one existing row,
// creating it with the approved V1 defaults on first read if it
// doesn't exist yet. No function in this file — and no route in
// adminReferralSettings.routes wiring — ever creates a second row;
// there is no generic "create settings" endpoint at all, only GET/PATCH
// (§8 of the brief).

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export class ReferralProgrammeSettingsError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ReferralProgrammeSettingsError";
    this.statusCode = statusCode;
  }
}

// Same 0-50% sanity ceiling as referralAffiliate.service.ts's own
// per-affiliate overrides — one shared reasoning, applied to the
// programme-wide defaults these overrides fall back to.
const MAX_RATE_PERCENT = 50;
const MIN_ATTRIBUTION_WINDOW_DAYS = 1;
const MAX_ATTRIBUTION_WINDOW_DAYS = 365;
const MIN_VALIDATION_DAYS = 0;
const MAX_VALIDATION_DAYS = 365;
const MAX_MINIMUM_PAYOUT = 100_000;
// 1-28 only, never up to 31 — a "day of month" that doesn't exist in
// every month (29/30/31) would either skip or roll over unpredictably
// come February; capping at 28 is the standard safe range for a
// recurring monthly day-of-month schedule.
const MIN_PAYOUT_DAY = 1;
const MAX_PAYOUT_DAY = 28;

const DEFAULT_SETTINGS = {
  defaultCommissionRate: new Prisma.Decimal("7.00"),
  defaultReferralDiscountRate: new Prisma.Decimal("5.00"),
  attributionWindowDays: 30,
  commissionValidationDays: 30,
  minimumPayoutAmount: new Prisma.Decimal("500.00"),
  payoutDayOfMonth: 15,
  isProgrammeActive: true,
};

export interface ReferralProgrammeSettingsOutput {
  id: string;
  defaultCommissionRate: number;
  defaultReferralDiscountRate: number;
  attributionWindowDays: number;
  commissionValidationDays: number;
  minimumPayoutAmount: number;
  payoutDayOfMonth: number;
  isProgrammeActive: boolean;
  updatedByAdminUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type SettingsRow = Prisma.AffiliateProgrammeSettingsGetPayload<Record<string, never>>;

function toOutput(row: SettingsRow): ReferralProgrammeSettingsOutput {
  return {
    id: row.id,
    defaultCommissionRate: row.defaultCommissionRate.toNumber(),
    defaultReferralDiscountRate: row.defaultReferralDiscountRate.toNumber(),
    attributionWindowDays: row.attributionWindowDays,
    commissionValidationDays: row.commissionValidationDays,
    minimumPayoutAmount: row.minimumPayoutAmount.toNumber(),
    payoutDayOfMonth: row.payoutDayOfMonth,
    isProgrammeActive: row.isProgrammeActive,
    updatedByAdminUserId: row.updatedByAdminUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Deliberately not a transaction-wrapped "upsert on a fixed id" —
// there is no fixed id to upsert against (cuid ids are random by
// design). Instead: try to read the one existing row; if genuinely
// none exists yet, create it with the approved V1 defaults. A
// theoretical double-create race (two simultaneous first-ever reads)
// is guarded by always re-reading and using whichever row already
// exists rather than trusting the one this call just created — see
// the try/catch below.
export async function getReferralProgrammeSettings(): Promise<ReferralProgrammeSettingsOutput> {
  const existing = await prisma.affiliateProgrammeSettings.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return toOutput(existing);

  try {
    const created = await prisma.affiliateProgrammeSettings.create({ data: DEFAULT_SETTINGS });
    return toOutput(created);
  } catch {
    // Another concurrent request already created it between our read
    // and our create attempt — re-read rather than error.
    const raceWinner = await prisma.affiliateProgrammeSettings.findFirst({ orderBy: { createdAt: "asc" } });
    if (!raceWinner) throw new ReferralProgrammeSettingsError("Could not read or create programme settings.", 500);
    return toOutput(raceWinner);
  }
}

function optionalRatePercent(raw: unknown, fieldName: string): Prisma.Decimal | undefined {
  if (raw === undefined) return undefined;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value < 0 || value > MAX_RATE_PERCENT) {
    throw new ReferralProgrammeSettingsError(`${fieldName} must be a number between 0 and ${MAX_RATE_PERCENT}.`);
  }
  return new Prisma.Decimal(value);
}

function optionalIntInRange(raw: unknown, fieldName: string, min: number, max: number): number | undefined {
  if (raw === undefined) return undefined;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ReferralProgrammeSettingsError(`${fieldName} must be a whole number between ${min} and ${max}.`);
  }
  return value;
}

function optionalNonNegativeDecimal(raw: unknown, fieldName: string, max: number): Prisma.Decimal | undefined {
  if (raw === undefined) return undefined;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new ReferralProgrammeSettingsError(`${fieldName} must be a non-negative number, ${max} or less.`);
  }
  return new Prisma.Decimal(value);
}

export interface ReferralProgrammeSettingsUpdateInput {
  defaultCommissionRate?: unknown;
  defaultReferralDiscountRate?: unknown;
  attributionWindowDays?: unknown;
  commissionValidationDays?: unknown;
  minimumPayoutAmount?: unknown;
  payoutDayOfMonth?: unknown;
  isProgrammeActive?: unknown;
}

const ALLOWED_UPDATE_FIELDS = [
  "defaultCommissionRate",
  "defaultReferralDiscountRate",
  "attributionWindowDays",
  "commissionValidationDays",
  "minimumPayoutAmount",
  "payoutDayOfMonth",
  "isProgrammeActive",
] as const;

// Applies to FUTURE qualifying orders only — this function never
// touches any existing OrderAffiliateCommission row, which already
// snapshots the rates that applied at its own creation time (§13/§21
// of the brief). Changing these numbers has zero effect on history.
export async function updateReferralProgrammeSettings(rawInput: unknown, updatedByAdminUserId: string | null): Promise<ReferralProgrammeSettingsOutput> {
  if (typeof rawInput !== "object" || rawInput === null) {
    throw new ReferralProgrammeSettingsError("Request body must be an object.");
  }
  const input = rawInput as Record<string, unknown>;

  const disallowedKeys = Object.keys(input).filter((key) => !(ALLOWED_UPDATE_FIELDS as readonly string[]).includes(key));
  if (disallowedKeys.length > 0) {
    throw new ReferralProgrammeSettingsError(`These fields cannot be edited: ${disallowedKeys.join(", ")}.`);
  }

  const current = await getReferralProgrammeSettings();

  const data: Prisma.AffiliateProgrammeSettingsUpdateInput = {};

  const commissionRate = optionalRatePercent(input.defaultCommissionRate, "defaultCommissionRate");
  if (commissionRate !== undefined) data.defaultCommissionRate = commissionRate;

  const discountRate = optionalRatePercent(input.defaultReferralDiscountRate, "defaultReferralDiscountRate");
  if (discountRate !== undefined) data.defaultReferralDiscountRate = discountRate;

  const attributionWindowDays = optionalIntInRange(input.attributionWindowDays, "attributionWindowDays", MIN_ATTRIBUTION_WINDOW_DAYS, MAX_ATTRIBUTION_WINDOW_DAYS);
  if (attributionWindowDays !== undefined) data.attributionWindowDays = attributionWindowDays;

  const commissionValidationDays = optionalIntInRange(input.commissionValidationDays, "commissionValidationDays", MIN_VALIDATION_DAYS, MAX_VALIDATION_DAYS);
  if (commissionValidationDays !== undefined) data.commissionValidationDays = commissionValidationDays;

  const minimumPayoutAmount = optionalNonNegativeDecimal(input.minimumPayoutAmount, "minimumPayoutAmount", MAX_MINIMUM_PAYOUT);
  if (minimumPayoutAmount !== undefined) data.minimumPayoutAmount = minimumPayoutAmount;

  const payoutDayOfMonth = optionalIntInRange(input.payoutDayOfMonth, "payoutDayOfMonth", MIN_PAYOUT_DAY, MAX_PAYOUT_DAY);
  if (payoutDayOfMonth !== undefined) data.payoutDayOfMonth = payoutDayOfMonth;

  if ("isProgrammeActive" in input) data.isProgrammeActive = Boolean(input.isProgrammeActive);

  if (Object.keys(data).length === 0) {
    throw new ReferralProgrammeSettingsError("No editable fields were provided.");
  }

  data.updatedByAdminUser = updatedByAdminUserId ? { connect: { id: updatedByAdminUserId } } : { disconnect: true };

  const updated = await prisma.affiliateProgrammeSettings.update({ where: { id: current.id }, data });
  return toOutput(updated);
}
