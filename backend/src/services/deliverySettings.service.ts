// Milestone 205: the one authoritative, admin-editable source of
// truth for delivery fees and the free-delivery threshold — see
// DeliverySettings' own schema comment for why this is a database row
// rather than a config/*.ts constant. Deterministic singleton:
// getDeliverySettings() always returns the one existing row, creating
// it with the Milestone 205 owner-approved defaults on first read if
// it doesn't exist yet. No function in this file — and no route in
// delivery.routes.ts/adminDelivery.routes.ts — ever creates a second
// row; there is no generic "create settings" endpoint at all, only
// GET/PATCH, same discipline as referralProgrammeSettings.service.ts.

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { COURIER_LOCKER_FEE, COURIER_DOOR_FEE, FREE_DELIVERY_THRESHOLD } from "../config/delivery.js";
import type { DeliveryRates } from "../utils/money.js";

export class DeliverySettingsError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DeliverySettingsError";
    this.statusCode = statusCode;
  }
}

// A delivery fee/threshold of R0 is legitimate (e.g. a promotional
// free-shipping period); there's no lower sanity bound beyond "not
// negative". The upper bound just guards against a typo (e.g. an
// extra zero) reaching production unnoticed — comfortably above any
// realistic South African courier rate or cart threshold this site
// would ever use.
const MAX_FEE = 10_000;
const MAX_THRESHOLD = 100_000;

const DEFAULT_SETTINGS = {
  courierLockerFee: new Prisma.Decimal(COURIER_LOCKER_FEE),
  courierDoorFee: new Prisma.Decimal(COURIER_DOOR_FEE),
  freeDeliveryThreshold: new Prisma.Decimal(FREE_DELIVERY_THRESHOLD),
};

export interface DeliverySettingsOutput {
  id: string;
  courierLockerFee: number;
  courierDoorFee: number;
  freeDeliveryThreshold: number;
  updatedByAdminUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type SettingsRow = Prisma.DeliverySettingsGetPayload<Record<string, never>>;

function toOutput(row: SettingsRow): DeliverySettingsOutput {
  return {
    id: row.id,
    courierLockerFee: row.courierLockerFee.toNumber(),
    courierDoorFee: row.courierDoorFee.toNumber(),
    freeDeliveryThreshold: row.freeDeliveryThreshold.toNumber(),
    updatedByAdminUserId: row.updatedByAdminUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Deliberately not a transaction-wrapped "upsert on a fixed id" — same
// reasoning as referralProgrammeSettings.service.ts's own
// getReferralProgrammeSettings(): there is no fixed id to upsert
// against (cuid ids are random by design). Instead: try to read the
// one existing row; if genuinely none exists yet, create it with the
// Milestone 205 defaults. A theoretical double-create race (two
// simultaneous first-ever reads) is guarded by always re-reading and
// using whichever row already exists rather than trusting the one
// this call just created.
export async function getDeliverySettings(): Promise<DeliverySettingsOutput> {
  const existing = await prisma.deliverySettings.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return toOutput(existing);

  try {
    const created = await prisma.deliverySettings.create({ data: DEFAULT_SETTINGS });
    return toOutput(created);
  } catch {
    const raceWinner = await prisma.deliverySettings.findFirst({ orderBy: { createdAt: "asc" } });
    if (!raceWinner) throw new DeliverySettingsError("Could not read or create delivery settings.", 500);
    return toOutput(raceWinner);
  }
}

// Thin convenience for callers (order.service.ts, delivery.service.ts)
// that just want the three Decimal rates money.ts's calculateDeliveryFee()
// takes, without dealing with the full output shape or doing the
// Decimal conversion themselves.
export async function getDeliveryRates(): Promise<DeliveryRates> {
  const settings = await getDeliverySettings();
  return {
    courierLockerFee: new Prisma.Decimal(settings.courierLockerFee),
    courierDoorFee: new Prisma.Decimal(settings.courierDoorFee),
    freeDeliveryThreshold: new Prisma.Decimal(settings.freeDeliveryThreshold),
  };
}

function optionalNonNegativeDecimal(raw: unknown, fieldName: string, max: number): Prisma.Decimal | undefined {
  if (raw === undefined) return undefined;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new DeliverySettingsError(`${fieldName} must be a non-negative number, ${max} or less.`);
  }
  return new Prisma.Decimal(value);
}

export interface DeliverySettingsUpdateInput {
  courierLockerFee?: unknown;
  courierDoorFee?: unknown;
  freeDeliveryThreshold?: unknown;
}

const ALLOWED_UPDATE_FIELDS = ["courierLockerFee", "courierDoorFee", "freeDeliveryThreshold"] as const;

// Applies to future fee calculations only — this function never
// touches any existing Order/Payment row, which already snapshots the
// delivery fee that applied at its own creation time. Changing these
// numbers has zero effect on an order already placed.
export async function updateDeliverySettings(rawInput: unknown, updatedByAdminUserId: string | null): Promise<DeliverySettingsOutput> {
  if (typeof rawInput !== "object" || rawInput === null) {
    throw new DeliverySettingsError("Request body must be an object.");
  }
  const input = rawInput as Record<string, unknown>;

  const disallowedKeys = Object.keys(input).filter((key) => !(ALLOWED_UPDATE_FIELDS as readonly string[]).includes(key));
  if (disallowedKeys.length > 0) {
    throw new DeliverySettingsError(`These fields cannot be edited: ${disallowedKeys.join(", ")}.`);
  }

  const current = await getDeliverySettings();

  const data: Prisma.DeliverySettingsUpdateInput = {};

  const courierLockerFee = optionalNonNegativeDecimal(input.courierLockerFee, "courierLockerFee", MAX_FEE);
  if (courierLockerFee !== undefined) data.courierLockerFee = courierLockerFee;

  const courierDoorFee = optionalNonNegativeDecimal(input.courierDoorFee, "courierDoorFee", MAX_FEE);
  if (courierDoorFee !== undefined) data.courierDoorFee = courierDoorFee;

  const freeDeliveryThreshold = optionalNonNegativeDecimal(input.freeDeliveryThreshold, "freeDeliveryThreshold", MAX_THRESHOLD);
  if (freeDeliveryThreshold !== undefined) data.freeDeliveryThreshold = freeDeliveryThreshold;

  if (Object.keys(data).length === 0) {
    throw new DeliverySettingsError("No editable fields were provided.");
  }

  data.updatedByAdminUser = updatedByAdminUserId ? { connect: { id: updatedByAdminUserId } } : { disconnect: true };

  const updated = await prisma.deliverySettings.update({ where: { id: current.id }, data });
  return toOutput(updated);
}
