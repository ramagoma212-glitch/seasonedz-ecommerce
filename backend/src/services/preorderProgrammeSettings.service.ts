// Milestone 181, Part D: the one authoritative, ADMIN-editable source
// of truth for the first-registered-customer preorder discount rate —
// same deterministic-singleton pattern as
// referralProgrammeSettings.service.ts (getSettings() always returns
// the one existing row, creating it with the owner-approved V1
// defaults on first read if it doesn't exist yet). No generic
// POST/create route exists anywhere for this — only GET/PATCH.

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export class PreorderProgrammeSettingsError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PreorderProgrammeSettingsError";
    this.statusCode = statusCode;
  }
}

// Owner-approved V1 defaults (brief Part D).
const MAX_RATE_PERCENT = 50;

const DEFAULT_SETTINGS = {
  firstRegisteredPreorderDiscountEnabled: true,
  firstRegisteredPreorderDiscountPercent: new Prisma.Decimal("10.00"),
};

export interface PreorderProgrammeSettingsOutput {
  id: string;
  firstRegisteredPreorderDiscountEnabled: boolean;
  firstRegisteredPreorderDiscountPercent: number;
  updatedByAdminUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type SettingsRow = Prisma.PreorderProgrammeSettingsGetPayload<Record<string, never>>;

function toOutput(row: SettingsRow): PreorderProgrammeSettingsOutput {
  return {
    id: row.id,
    firstRegisteredPreorderDiscountEnabled: row.firstRegisteredPreorderDiscountEnabled,
    firstRegisteredPreorderDiscountPercent: row.firstRegisteredPreorderDiscountPercent.toNumber(),
    updatedByAdminUserId: row.updatedByAdminUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Same "read, or create-with-defaults-on-first-read, re-read on a
// concurrent double-create race" discipline as
// referralProgrammeSettings.service.ts's own getReferralProgrammeSettings().
export async function getPreorderProgrammeSettings(): Promise<PreorderProgrammeSettingsOutput> {
  const existing = await prisma.preorderProgrammeSettings.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return toOutput(existing);

  try {
    const created = await prisma.preorderProgrammeSettings.create({ data: DEFAULT_SETTINGS });
    return toOutput(created);
  } catch {
    const raceWinner = await prisma.preorderProgrammeSettings.findFirst({ orderBy: { createdAt: "asc" } });
    if (!raceWinner) throw new PreorderProgrammeSettingsError("Could not read or create preorder programme settings.", 500);
    return toOutput(raceWinner);
  }
}

export interface PreorderProgrammeSettingsUpdateInput {
  firstRegisteredPreorderDiscountEnabled?: unknown;
  firstRegisteredPreorderDiscountPercent?: unknown;
}

const ALLOWED_UPDATE_FIELDS = ["firstRegisteredPreorderDiscountEnabled", "firstRegisteredPreorderDiscountPercent"] as const;

// Applies to FUTURE qualifying orders only — this function never
// touches any existing PreorderDiscountRedemption/OrderItem snapshot,
// which already captured the rate that applied at the moment it was
// used (Part M). Changing this number has zero effect on history.
export async function updatePreorderProgrammeSettings(rawInput: unknown, updatedByAdminUserId: string | null): Promise<PreorderProgrammeSettingsOutput> {
  if (typeof rawInput !== "object" || rawInput === null) {
    throw new PreorderProgrammeSettingsError("Request body must be an object.");
  }
  const input = rawInput as Record<string, unknown>;

  const disallowedKeys = Object.keys(input).filter((key) => !(ALLOWED_UPDATE_FIELDS as readonly string[]).includes(key));
  if (disallowedKeys.length > 0) {
    throw new PreorderProgrammeSettingsError(`These fields cannot be edited: ${disallowedKeys.join(", ")}.`);
  }

  const current = await getPreorderProgrammeSettings();
  const data: Prisma.PreorderProgrammeSettingsUpdateInput = {};

  if ("firstRegisteredPreorderDiscountEnabled" in input) {
    data.firstRegisteredPreorderDiscountEnabled = Boolean(input.firstRegisteredPreorderDiscountEnabled);
  }

  if (input.firstRegisteredPreorderDiscountPercent !== undefined) {
    const raw = input.firstRegisteredPreorderDiscountPercent;
    const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value < 0 || value > MAX_RATE_PERCENT) {
      throw new PreorderProgrammeSettingsError(`firstRegisteredPreorderDiscountPercent must be a number between 0 and ${MAX_RATE_PERCENT}.`);
    }
    data.firstRegisteredPreorderDiscountPercent = new Prisma.Decimal(value);
  }

  if (Object.keys(data).length === 0) {
    throw new PreorderProgrammeSettingsError("No editable fields were provided.");
  }

  data.updatedByAdminUser = updatedByAdminUserId ? { connect: { id: updatedByAdminUserId } } : { disconnect: true };

  const updated = await prisma.preorderProgrammeSettings.update({ where: { id: current.id }, data });
  return toOutput(updated);
}
