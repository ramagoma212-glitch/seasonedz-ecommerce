// Courier Guy admin-only RATE QUOTE service (Version 7, Milestone 108).
//
// Calls ONLY POST {baseUrl}/rates — The Courier Guy's own developer-
// portal quote endpoint (built on the ShipLogic platform; sandbox base
// URL api.shiplogic.com). This file must NEVER call a booking/
// shipment-creation endpoint (e.g. POST /shipments) — that is
// explicitly out of scope for this milestone and is not implemented
// anywhere in this codebase. No booking is ever created, no waybill is
// ever generated, no order/shipping/payment row is ever written to
// from this file.
//
// Fails closed: if COURIER_GUY_ENABLED is false, this throws before
// building any request, looking up any order, or making any network
// call — the same discipline env.payfastEnabled/PayFast already use.
//
// Parcel field names (submitted_length_cm/width_cm/height_cm/weight_kg)
// and address fields (company/street_address/local_area/city/zone/
// country/code/type) match ShipLogic's own publicly documented rate-
// request schema — the same address field names the task's own env
// variable list already confirmed. The exact RESPONSE shape for a
// successful quote was not included in what this milestone was given,
// so normalizeQuoteResponse() below deliberately does not assume one
// fixed shape — it tries several plausible common field names per rate
// option and skips (never crashes on) any entry it can't make sense
// of, only failing with a clear, distinct error if literally nothing
// in the response can be recognised as a rate option at all. Verify
// this against the real sandbox response the first time
// COURIER_GUY_ENABLED is turned on with real credentials.

import { courierGuyConfig } from "../config/courierGuy.js";
import { isProduction } from "../config/env.js";
import { prisma } from "../config/prisma.js";

export class CourierQuoteError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "CourierQuoteError";
    this.statusCode = statusCode;
  }
}

const MIN_PARCEL_WEIGHT_KG = 0.01;
const MAX_PARCEL_WEIGHT_KG = 50;
const MIN_PARCEL_DIMENSION_CM = 1;
const MAX_PARCEL_DIMENSION_CM = 200;
const QUOTE_REQUEST_TIMEOUT_MS = 10_000;

export interface ParcelInput {
  weightKg?: unknown;
  lengthCm?: unknown;
  widthCm?: unknown;
  heightCm?: unknown;
  declaredValue?: unknown;
}

export interface QuoteOption {
  serviceName: string;
  serviceLevelCode: string | null;
  serviceLevelId: string | null;
  price: number;
  etaFrom: string | number | null;
  etaTo: string | number | null;
  providerReference: string | null;
  rawProvider?: unknown;
}

export interface QuoteResult {
  options: QuoteOption[];
  message?: string;
}

function parseParcelNumber(raw: unknown, fieldName: string, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw === null || raw === "") return fallback;

  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    throw new CourierQuoteError(`${fieldName} must be a number.`);
  }
  if (value < min || value > max) {
    throw new CourierQuoteError(`${fieldName} must be between ${min} and ${max}.`);
  }
  return value;
}

function parseOptionalDeclaredValue(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new CourierQuoteError("declaredValue must be a non-negative number.");
  }
  return value;
}

function validateParcel(input: ParcelInput) {
  const weightKg = parseParcelNumber(input.weightKg, "weightKg", courierGuyConfig.defaultParcel.weightKg, MIN_PARCEL_WEIGHT_KG, MAX_PARCEL_WEIGHT_KG);
  const lengthCm = parseParcelNumber(input.lengthCm, "lengthCm", courierGuyConfig.defaultParcel.lengthCm, MIN_PARCEL_DIMENSION_CM, MAX_PARCEL_DIMENSION_CM);
  const widthCm = parseParcelNumber(input.widthCm, "widthCm", courierGuyConfig.defaultParcel.widthCm, MIN_PARCEL_DIMENSION_CM, MAX_PARCEL_DIMENSION_CM);
  const heightCm = parseParcelNumber(input.heightCm, "heightCm", courierGuyConfig.defaultParcel.heightCm, MIN_PARCEL_DIMENSION_CM, MAX_PARCEL_DIMENSION_CM);
  const declaredValue = parseOptionalDeclaredValue(input.declaredValue);

  return { weightKg, lengthCm, widthCm, heightCm, declaredValue };
}

// South Africa is the only country this business ships within today
// (backend/src/config/delivery.ts's DEFAULT_COUNTRY) — every order's
// deliveryCountry column is realistically always "South Africa".
// ShipLogic's address schema expects an ISO country code (the
// collection address config already uses "ZA"), so this maps the one
// real value this codebase ever produces rather than guessing a
// general-purpose country-name-to-code table it doesn't need.
function toCountryCode(country: string): string {
  const trimmed = country.trim();
  if (trimmed.toLowerCase() === "south africa") return "ZA";
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return trimmed;
}

export interface OrderDeliveryFields {
  customerFirstName: string;
  customerLastName: string;
  deliveryStreetAddress: string;
  deliverySuburb: string;
  deliveryCity: string;
  deliveryProvince: string;
  deliveryPostalCode: string;
  deliveryCountry: string;
}

function validateOrderDeliveryAddress(order: OrderDeliveryFields) {
  const missing: string[] = [];
  if (!order.deliveryStreetAddress?.trim()) missing.push("street address");
  if (!order.deliverySuburb?.trim()) missing.push("suburb");
  if (!order.deliveryCity?.trim()) missing.push("city");
  if (!order.deliveryProvince?.trim()) missing.push("province");
  if (!order.deliveryPostalCode?.trim()) missing.push("postal code");
  if (!order.deliveryCountry?.trim()) missing.push("country");

  if (missing.length > 0) {
    throw new CourierQuoteError(`This order's delivery address is missing: ${missing.join(", ")}.`, 400);
  }
}

function buildCollectionAddress() {
  const { collection } = courierGuyConfig;
  return {
    company: collection.company,
    street_address: collection.streetAddress,
    local_area: collection.localArea,
    city: collection.city,
    zone: collection.zone,
    country: collection.country,
    code: collection.code,
    type: collection.type,
  };
}

function buildDeliveryAddress(order: OrderDeliveryFields) {
  return {
    // ShipLogic's documented address schema has no separate "contact
    // name" field alongside "company" — best-effort mapping, using the
    // customer's name since this is a residential address, not a
    // business. Verify against the real sandbox schema before ever
    // using this for a real booking (out of scope here).
    company: `${order.customerFirstName} ${order.customerLastName}`.trim(),
    street_address: order.deliveryStreetAddress,
    local_area: order.deliverySuburb,
    city: order.deliveryCity,
    zone: order.deliveryProvince,
    country: toCountryCode(order.deliveryCountry),
    code: order.deliveryPostalCode,
    type: "residential",
  };
}

function buildParcels(parcel: { weightKg: number; lengthCm: number; widthCm: number; heightCm: number }) {
  return [
    {
      submitted_length_cm: parcel.lengthCm,
      submitted_width_cm: parcel.widthCm,
      submitted_height_cm: parcel.heightCm,
      submitted_weight_kg: parcel.weightKg,
    },
  ];
}

// --- Response normalisation ------------------------------------------------
//
// See this file's own header comment for why the exact shape isn't
// assumed. findRateArray() accepts a bare array or an array nested
// under a few plausible keys; mapRateEntry() tries several plausible
// field names per entry and returns null (skip, never throw) for an
// entry it can't make sense of.

function findRateArray(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["rates", "data", "results"]) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
  }
  return null;
}

function pickFirst(obj: Record<string, unknown>, paths: string[]): unknown {
  for (const path of paths) {
    let value: unknown = obj;
    for (const segment of path.split(".")) {
      if (value && typeof value === "object") {
        value = (value as Record<string, unknown>)[segment];
      } else {
        value = undefined;
        break;
      }
    }
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function mapRateEntry(entry: unknown): QuoteOption | null {
  if (!entry || typeof entry !== "object") return null;
  const obj = entry as Record<string, unknown>;

  const serviceNameRaw = pickFirst(obj, ["service_level.name", "serviceName", "name", "service.name", "description"]);
  const priceRaw = pickFirst(obj, ["rate", "total_charge", "total", "price", "charge"]);

  const serviceName = typeof serviceNameRaw === "string" ? serviceNameRaw : undefined;
  const price = typeof priceRaw === "number" ? priceRaw : Number(priceRaw);

  // serviceName and a real numeric price are the two fields an admin
  // actually needs to pick a service — an entry missing either isn't
  // usable, so it's skipped rather than shown with blanks.
  if (!serviceName || !Number.isFinite(price)) return null;

  const serviceLevelCodeRaw = pickFirst(obj, ["service_level.code", "serviceLevelCode", "code"]);
  const serviceLevelIdRaw = pickFirst(obj, ["service_level.id", "serviceLevelId", "id"]);
  const etaFromRaw = pickFirst(obj, ["transit_days_min", "eta_from", "min_transit_days", "delivery_date_from"]);
  const etaToRaw = pickFirst(obj, ["transit_days_max", "eta_to", "max_transit_days", "delivery_date_to", "transit_days"]);
  const referenceRaw = pickFirst(obj, ["reference", "rate_id", "service_level.id", "id"]);

  const option: QuoteOption = {
    serviceName,
    serviceLevelCode: typeof serviceLevelCodeRaw === "string" ? serviceLevelCodeRaw : null,
    serviceLevelId: serviceLevelIdRaw !== undefined ? String(serviceLevelIdRaw) : null,
    price,
    etaFrom: typeof etaFromRaw === "string" || typeof etaFromRaw === "number" ? etaFromRaw : null,
    etaTo: typeof etaToRaw === "string" || typeof etaToRaw === "number" ? etaToRaw : null,
    providerReference: referenceRaw !== undefined ? String(referenceRaw) : null,
  };

  // Only attached outside production, and only to help diagnose a
  // response shape this normalizer didn't fully expect.
  if (!isProduction) {
    option.rawProvider = entry;
  }

  return option;
}

export function normalizeQuoteResponse(raw: unknown): QuoteResult {
  const rateArray = findRateArray(raw);

  if (rateArray === null) {
    throw new CourierQuoteError(
      "Courier Guy returned a response this admin quote feature doesn't recognise yet. No quote could be shown.",
      502
    );
  }

  const options = rateArray.map(mapRateEntry).filter((option): option is QuoteOption => option !== null);

  if (options.length === 0) {
    return { options: [], message: "No courier quote options were returned for this address and parcel." };
  }

  return { options };
}

// --- Main entry point -------------------------------------------------------

export interface GetCourierQuoteInput {
  parcel: ParcelInput;
}

export async function getCourierQuote(orderNumber: string, input: GetCourierQuoteInput): Promise<QuoteResult> {
  // Fails closed before anything else — no config lookup beyond this
  // one flag, no order lookup, no network call — matching PayFast's
  // own env.payfastEnabled gate discipline.
  if (!courierGuyConfig.enabled) {
    throw new CourierQuoteError("Courier quote is not enabled yet.", 503);
  }

  // Defensive re-check even though env.ts already validates this
  // eagerly at startup whenever COURIER_GUY_ENABLED=true — keeps this
  // service safe to unit-test directly against a partially configured
  // courierGuyConfig without needing to reload env.ts.
  const missingConfig: string[] = [];
  if (!courierGuyConfig.apiKey) missingConfig.push("API key");
  if (!courierGuyConfig.collection.company) missingConfig.push("collection company");
  if (!courierGuyConfig.collection.streetAddress) missingConfig.push("collection street address");
  if (!courierGuyConfig.collection.localArea) missingConfig.push("collection local area");
  if (!courierGuyConfig.collection.city) missingConfig.push("collection city");
  if (!courierGuyConfig.collection.zone) missingConfig.push("collection zone");
  if (!courierGuyConfig.collection.code) missingConfig.push("collection postal code");

  if (missingConfig.length > 0) {
    throw new CourierQuoteError(`Courier Guy is enabled but not fully configured — missing: ${missingConfig.join(", ")}.`, 500);
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: {
      customerFirstName: true,
      customerLastName: true,
      deliveryStreetAddress: true,
      deliverySuburb: true,
      deliveryCity: true,
      deliveryProvince: true,
      deliveryPostalCode: true,
      deliveryCountry: true,
    },
  });

  if (!order) {
    throw new CourierQuoteError(`Order not found: ${orderNumber}`, 404);
  }

  validateOrderDeliveryAddress(order);
  const parcel = validateParcel(input.parcel);

  const body: Record<string, unknown> = {
    collection_address: buildCollectionAddress(),
    delivery_address: buildDeliveryAddress(order),
    parcels: buildParcels(parcel),
  };
  if (parcel.declaredValue !== undefined) {
    body.declared_value = parcel.declaredValue;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), QUOTE_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${courierGuyConfig.baseUrl}/rates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${courierGuyConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new CourierQuoteError("Could not reach Courier Guy. Please try again shortly.", 502);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new CourierQuoteError(`Courier Guy rate request failed (${response.status}).`, 502);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new CourierQuoteError("Courier Guy returned a response that could not be read.", 502);
  }

  return normalizeQuoteResponse(json);
}
