// Courier Guy admin-only RATE QUOTE + BOOKING service (Version 7,
// Milestone 108 quote, Milestone 112 booking).
//
// Quote calls ONLY POST {baseUrl}/rates. Booking calls ONLY POST
// {baseUrl}/shipments, and ONLY when both env.courierGuyEnabled AND
// env.courierGuyBookingEnabled are true — the booking flag is
// deliberately separate and defaults to false, since a booking creates
// a real, billable Courier Guy shipment while a quote is read-only.
// This file must NEVER call a label/waybill-download endpoint (e.g.
// POST /shipments/label) — that is explicitly out of scope for
// Milestone 112 (see bookCourierShipment()'s own comment) and is not
// implemented anywhere in this codebase.
//
// Fails closed: quote fails before any network call if
// courierGuyEnabled is false; booking fails before any network call if
// either courierGuyEnabled or courierGuyBookingEnabled is false — the
// same discipline env.payfastEnabled/PayFast already uses.
//
// Parcel field names (submitted_length_cm/width_cm/height_cm/weight_kg)
// and address fields (company/street_address/local_area/city/zone/
// country/code/type) match ShipLogic's own publicly documented rate-
// request schema — the same address field names the Milestone 108 task
// confirmed. The exact RESPONSE shape for a successful quote was not
// included in what that milestone was given, so normalizeQuoteResponse()
// below deliberately does not assume one fixed shape — it tries several
// plausible common field names per rate option and skips (never
// crashes on) any entry it can't make sense of, only failing with a
// clear, distinct error if literally nothing in the response can be
// recognised as a rate option at all. This was verified against the
// real sandbox and production /rates responses in Milestones 109/110.
//
// Booking's collection_contact/delivery_contact field names
// (name/mobile_number/email) are a best-effort assumption based on
// ShipLogic's typical contact-object schema — Milestone 112's own task
// did not include an exact contact-field spec (only that
// collection_contact/delivery_contact objects are required), so this
// must be verified against a real sandbox booking response before
// COURIER_GUY_BOOKING_ENABLED is ever set to true, exactly the same
// "verify before relying on it" caveat the quote code already applied
// to service_level/response fields.

import { FulfilmentStatus, PaymentStatus, Prisma } from "@prisma/client";
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

// validateParcel()/validateOrderDeliveryAddress() below are shared by
// both getCourierQuote() and bookCourierShipment() — each caller's own
// controller only catches its own error class (getCourierQuoteHandler
// catches CourierQuoteError, bookCourierShipmentHandler catches
// CourierBookingError), so a shared validator must throw whichever
// class its caller passes in, not a hardcoded one — otherwise a
// booking-time validation failure would fall through to a generic
// unhandled-error 500 instead of the clean 400 it should be.
interface CourierErrorConstructor {
  new (message: string, statusCode?: number): Error & { statusCode: number };
}

function parseParcelNumber(raw: unknown, fieldName: string, fallback: number, min: number, max: number, ErrorClass: CourierErrorConstructor): number {
  if (raw === undefined || raw === null || raw === "") return fallback;

  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    throw new ErrorClass(`${fieldName} must be a number.`);
  }
  if (value < min || value > max) {
    throw new ErrorClass(`${fieldName} must be between ${min} and ${max}.`);
  }
  return value;
}

function parseOptionalDeclaredValue(raw: unknown, ErrorClass: CourierErrorConstructor): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new ErrorClass("declaredValue must be a non-negative number.");
  }
  return value;
}

function validateParcel(input: ParcelInput, ErrorClass: CourierErrorConstructor) {
  const weightKg = parseParcelNumber(input.weightKg, "weightKg", courierGuyConfig.defaultParcel.weightKg, MIN_PARCEL_WEIGHT_KG, MAX_PARCEL_WEIGHT_KG, ErrorClass);
  const lengthCm = parseParcelNumber(input.lengthCm, "lengthCm", courierGuyConfig.defaultParcel.lengthCm, MIN_PARCEL_DIMENSION_CM, MAX_PARCEL_DIMENSION_CM, ErrorClass);
  const widthCm = parseParcelNumber(input.widthCm, "widthCm", courierGuyConfig.defaultParcel.widthCm, MIN_PARCEL_DIMENSION_CM, MAX_PARCEL_DIMENSION_CM, ErrorClass);
  const heightCm = parseParcelNumber(input.heightCm, "heightCm", courierGuyConfig.defaultParcel.heightCm, MIN_PARCEL_DIMENSION_CM, MAX_PARCEL_DIMENSION_CM, ErrorClass);
  const declaredValue = parseOptionalDeclaredValue(input.declaredValue, ErrorClass);

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

function validateOrderDeliveryAddress(order: OrderDeliveryFields, ErrorClass: CourierErrorConstructor) {
  const missing: string[] = [];
  if (!order.deliveryStreetAddress?.trim()) missing.push("street address");
  if (!order.deliverySuburb?.trim()) missing.push("suburb");
  if (!order.deliveryCity?.trim()) missing.push("city");
  if (!order.deliveryProvince?.trim()) missing.push("province");
  if (!order.deliveryPostalCode?.trim()) missing.push("postal code");
  if (!order.deliveryCountry?.trim()) missing.push("country");

  if (missing.length > 0) {
    throw new ErrorClass(`This order's delivery address is missing: ${missing.join(", ")}.`, 400);
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

  validateOrderDeliveryAddress(order, CourierQuoteError);
  const parcel = validateParcel(input.parcel, CourierQuoteError);

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

// =============================================================================
// BOOKING (Version 7, Milestone 112)
// =============================================================================
//
// Calls ONLY POST {baseUrl}/shipments — never a label/waybill endpoint
// (e.g. POST /shipments/label or /shipments/label/stickers). Label/
// waybill download is explicitly out of scope for this milestone; see
// VERSION_7_COURIER_GUY_BOOKING_PLAN.md (Milestone 111) for why —
// recommended as its own later milestone once booking itself is proven
// safe and boring in production.

export class CourierBookingError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "CourierBookingError";
    this.statusCode = statusCode;
  }
}

const BOOKING_REQUEST_TIMEOUT_MS = 15_000;
const MAX_SERVICE_FIELD_LENGTH = 200;

// Payment statuses that permanently block booking, no admin override —
// unlike PENDING (blocked unless the admin explicitly confirms below),
// these represent a payment that is known NOT to be good.
const HARD_BLOCKED_PAYMENT_STATUSES: PaymentStatus[] = [PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.REFUNDED];

export interface BookCourierShipmentInput {
  parcel: ParcelInput;
  serviceLevelCode?: unknown;
  serviceLevelId?: unknown;
  // Milestone 111's own audit found paymentStatus can never actually
  // become PAID for a BANK_TRANSFER/CASH_ON_DELIVERY order today (no
  // admin route sets it, and PayFast's ITN — the only thing that does
  // — is disabled) — so PAID-only would make booking permanently
  // unusable for every real order the business currently has. This
  // explicit admin attestation is the safe alternative for a PENDING
  // order, required by the backend (never trusted from the frontend
  // alone) and recorded via courierBookedAt/the booking itself
  // succeeding, exactly as planned.
  paymentConfirmed?: unknown;
  specialInstructionsCollection?: unknown;
  specialInstructionsDelivery?: unknown;
}

export interface BookingResult {
  orderNumber: string;
  fulfilmentStatus: FulfilmentStatus;
  shipping: {
    status: FulfilmentStatus;
    courierName: string | null;
    courierProvider: string | null;
    courierShipmentId: string | null;
    courierServiceCode: string | null;
    courierServiceName: string | null;
    courierCost: Prisma.Decimal | null;
    courierBookedAt: Date | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    estimatedDelivery: Date | null;
  };
}

interface OrderBookingFields {
  id: string;
  orderNumber: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone: string;
  paymentStatus: PaymentStatus;
  fulfilmentStatus: FulfilmentStatus;
  deliveryStreetAddress: string;
  deliverySuburb: string;
  deliveryCity: string;
  deliveryProvince: string;
  deliveryPostalCode: string;
  deliveryCountry: string;
  shipping: {
    trackingNumber: string | null;
    courierShipmentId: string | null;
    courierBookedAt: Date | null;
  } | null;
}

// Returns the exact snake_case key ShipLogic's /shipments payload
// expects — this is spread directly into the request body, so the key
// name here IS the wire field name, not an internal alias.
function parseServiceLevel(input: BookCourierShipmentInput): { service_level_code: string } | { service_level_id: string } {
  const code = typeof input.serviceLevelCode === "string" ? input.serviceLevelCode.trim() : "";
  const id = typeof input.serviceLevelId === "string" || typeof input.serviceLevelId === "number" ? String(input.serviceLevelId).trim() : "";

  if (!code && !id) {
    throw new CourierBookingError("A courier service must be selected from the quote before booking.", 400);
  }

  return code ? { service_level_code: code } : { service_level_id: id };
}

function validateBookingCollectionContact() {
  const { collectionContact } = courierGuyConfig;
  const missing: string[] = [];
  if (!collectionContact.name) missing.push("collection contact name");
  if (!collectionContact.phone && !collectionContact.email) missing.push("collection contact phone or email");

  if (missing.length > 0) {
    throw new CourierBookingError(`Courier Guy booking is enabled but not fully configured — missing: ${missing.join(", ")}.`, 500);
  }
}

function validateDeliveryContact(order: OrderBookingFields) {
  const missing: string[] = [];
  if (!order.customerEmail?.trim()) missing.push("email");
  if (!order.customerPhone?.trim()) missing.push("phone");

  if (missing.length > 0) {
    throw new CourierBookingError(`This order's customer contact details are missing: ${missing.join(", ")}.`, 400);
  }
}

function checkDuplicateBooking(order: OrderBookingFields) {
  const shipping = order.shipping;
  if (shipping && (shipping.trackingNumber || shipping.courierShipmentId || shipping.courierBookedAt)) {
    throw new CourierBookingError("This order already has a courier booking — booking again is not allowed.", 409);
  }
}

function checkPaymentSafety(order: OrderBookingFields, paymentConfirmed: unknown) {
  if (HARD_BLOCKED_PAYMENT_STATUSES.includes(order.paymentStatus)) {
    throw new CourierBookingError(
      `This order's payment status (${order.paymentStatus}) does not allow courier booking.`,
      400
    );
  }

  if (order.paymentStatus === PaymentStatus.PAID) return;

  // PENDING (the only remaining case) requires the admin's explicit,
  // backend-enforced attestation — see BookCourierShipmentInput's own
  // comment for why PAID-only isn't workable today.
  if (paymentConfirmed !== true) {
    throw new CourierBookingError(
      "This order is not marked as paid. Confirm payment has been checked before booking a courier.",
      400
    );
  }
}

// Best-effort mapping — see this file's header comment. Verify against
// a real sandbox booking response before COURIER_GUY_BOOKING_ENABLED is
// ever set to true.
function buildCollectionContact() {
  const { collectionContact } = courierGuyConfig;
  return {
    name: collectionContact.name,
    mobile_number: collectionContact.phone,
    email: collectionContact.email,
  };
}

function buildDeliveryContact(order: OrderBookingFields) {
  return {
    name: `${order.customerFirstName} ${order.customerLastName}`.trim(),
    mobile_number: order.customerPhone,
    email: order.customerEmail,
  };
}

function truncateServiceField(raw: string): string {
  return raw.length > MAX_SERVICE_FIELD_LENGTH ? raw.slice(0, MAX_SERVICE_FIELD_LENGTH) : raw;
}

interface MappedBookingResponse {
  shipmentId: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  serviceLevelCode: string | null;
  serviceLevelName: string | null;
  cost: number | null;
  estimatedDeliveryFrom: string | null;
}

// Defensive mapper, same discipline as normalizeQuoteResponse() above —
// tries several plausible field names, and only fails loudly (never
// silently saves a hollow "booking") if literally neither a shipment
// ID nor a tracking reference can be found anywhere in the response.
function mapBookingResponse(raw: unknown): MappedBookingResponse {
  if (!raw || typeof raw !== "object") {
    throw new CourierBookingError(
      "Courier Guy returned a response this booking feature doesn't recognise. Check the Courier Guy account directly before retrying — no booking details were saved.",
      502
    );
  }

  const obj = raw as Record<string, unknown>;

  const shipmentIdRaw = pickFirst(obj, ["id", "shipment_id"]);
  const trackingRaw = pickFirst(obj, ["short_tracking_reference", "custom_tracking_reference", "tracking_reference"]);
  const trackingUrlRaw = pickFirst(obj, ["tracking_url", "trackingUrl", "waybill_url"]);
  const serviceLevelCodeRaw = pickFirst(obj, ["service_level.code", "service_level_code"]);
  const serviceLevelNameRaw = pickFirst(obj, ["service_level.name", "service_level_name"]);
  const rateRaw = pickFirst(obj, ["rate", "total_charge", "total", "price"]);
  const etaFromRaw = pickFirst(obj, ["estimated_delivery_from", "delivery_date_from"]);

  const shipmentId = shipmentIdRaw !== undefined ? String(shipmentIdRaw) : null;
  const trackingNumber = trackingRaw !== undefined ? String(trackingRaw) : null;

  // A response with neither a shipment ID nor any tracking reference
  // can't be trusted as "a shipment was actually created" — fail
  // loudly rather than saving an empty-looking booking record that
  // would then block any real retry via the duplicate-booking check.
  if (!shipmentId && !trackingNumber) {
    throw new CourierBookingError(
      "Courier Guy returned a response this booking feature doesn't recognise. Check the Courier Guy account directly before retrying — no booking details were saved.",
      502
    );
  }

  let trackingUrl: string | null = null;
  if (typeof trackingUrlRaw === "string") {
    try {
      const url = new URL(trackingUrlRaw);
      if (url.protocol === "http:" || url.protocol === "https:") trackingUrl = trackingUrlRaw;
    } catch {
      // Not a valid URL — leave trackingUrl null rather than saving
      // something the admin can't click through to.
    }
  }

  const rate = typeof rateRaw === "number" ? rateRaw : Number(rateRaw);

  return {
    shipmentId,
    trackingNumber,
    trackingUrl,
    serviceLevelCode: typeof serviceLevelCodeRaw === "string" ? truncateServiceField(serviceLevelCodeRaw) : null,
    serviceLevelName: typeof serviceLevelNameRaw === "string" ? truncateServiceField(serviceLevelNameRaw) : null,
    cost: Number.isFinite(rate) ? rate : null,
    estimatedDeliveryFrom: typeof etaFromRaw === "string" ? etaFromRaw : null,
  };
}

export async function bookCourierShipment(orderNumber: string, input: BookCourierShipmentInput): Promise<BookingResult> {
  // Fails closed before anything else, in order — quote must be
  // enabled (booking is meaningless without it), then booking itself.
  if (!courierGuyConfig.enabled) {
    throw new CourierBookingError("Courier quote is not enabled yet.", 503);
  }
  if (!courierGuyConfig.bookingEnabled) {
    throw new CourierBookingError("Courier booking is not enabled yet.", 503);
  }

  // Same defensive re-check discipline as getCourierQuote() above.
  const missingConfig: string[] = [];
  if (!courierGuyConfig.apiKey) missingConfig.push("API key");
  if (!courierGuyConfig.collection.company) missingConfig.push("collection company");
  if (!courierGuyConfig.collection.streetAddress) missingConfig.push("collection street address");
  if (!courierGuyConfig.collection.localArea) missingConfig.push("collection local area");
  if (!courierGuyConfig.collection.city) missingConfig.push("collection city");
  if (!courierGuyConfig.collection.zone) missingConfig.push("collection zone");
  if (!courierGuyConfig.collection.code) missingConfig.push("collection postal code");
  if (missingConfig.length > 0) {
    throw new CourierBookingError(`Courier Guy is enabled but not fully configured — missing: ${missingConfig.join(", ")}.`, 500);
  }
  validateBookingCollectionContact();

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      orderNumber: true,
      customerFirstName: true,
      customerLastName: true,
      customerEmail: true,
      customerPhone: true,
      paymentStatus: true,
      fulfilmentStatus: true,
      deliveryStreetAddress: true,
      deliverySuburb: true,
      deliveryCity: true,
      deliveryProvince: true,
      deliveryPostalCode: true,
      deliveryCountry: true,
      shipping: {
        select: { trackingNumber: true, courierShipmentId: true, courierBookedAt: true },
      },
    },
  });

  if (!order) {
    throw new CourierBookingError(`Order not found: ${orderNumber}`, 404);
  }
  if (!order.shipping) {
    // Never happens today — order.service.ts always creates a Shipping
    // row alongside every order — handled explicitly rather than
    // assumed, same discipline as adminShipping.service.ts.
    throw new CourierBookingError("This order has no shipping record to book against.", 404);
  }

  // Duplicate-booking is an irreversible-state check, so it short-
  // circuits everything else regardless of input validity. Input
  // validation (address/contact/parcel/service) runs next, so a
  // malformed request gets a clear, specific 400 about the actual
  // problem; the payment-safety gate — "is this action allowed at
  // all" — runs last, only once the request itself is known to be
  // well-formed.
  checkDuplicateBooking(order);
  validateOrderDeliveryAddress(order, CourierBookingError);
  validateDeliveryContact(order);
  const parcel = validateParcel(input.parcel, CourierBookingError);
  const service = parseServiceLevel(input);
  checkPaymentSafety(order, input.paymentConfirmed);

  const specialInstructionsCollection =
    typeof input.specialInstructionsCollection === "string" && input.specialInstructionsCollection.trim()
      ? input.specialInstructionsCollection.trim().slice(0, 500)
      : undefined;
  const specialInstructionsDelivery =
    typeof input.specialInstructionsDelivery === "string" && input.specialInstructionsDelivery.trim()
      ? input.specialInstructionsDelivery.trim().slice(0, 500)
      : undefined;

  const body: Record<string, unknown> = {
    collection_address: buildCollectionAddress(),
    collection_contact: buildCollectionContact(),
    delivery_address: buildDeliveryAddress(order),
    delivery_contact: buildDeliveryContact(order),
    parcels: buildParcels(parcel),
    customer_reference: order.orderNumber,
    customer_reference_name: "Order No",
    // Never muted without a reason — the default Courier Guy customer
    // notification behaviour is left untouched.
    mute_notifications: false,
    ...service,
  };
  if (parcel.declaredValue !== undefined) body.declared_value = parcel.declaredValue;
  if (specialInstructionsCollection) body.special_instructions_collection = specialInstructionsCollection;
  if (specialInstructionsDelivery) body.special_instructions_delivery = specialInstructionsDelivery;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BOOKING_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${courierGuyConfig.baseUrl}/shipments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${courierGuyConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new CourierBookingError("Could not reach Courier Guy. Please try again shortly — no booking was created.", 502);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new CourierBookingError(`Courier Guy booking request failed (${response.status}). No booking was created.`, 502);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new CourierBookingError("Courier Guy returned a response that could not be read. Check the Courier Guy account directly before retrying.", 502);
  }

  const mapped = mapBookingResponse(json);

  const newFulfilmentStatus = order.fulfilmentStatus === FulfilmentStatus.NOT_STARTED ? FulfilmentStatus.PACKING : undefined;

  const shippingData: Prisma.ShippingUpdateInput = {
    courierName: "The Courier Guy",
    courierProvider: "courier-guy",
    courierShipmentId: mapped.shipmentId,
    courierServiceCode: mapped.serviceLevelCode,
    courierServiceName: mapped.serviceLevelName,
    courierCost: mapped.cost !== null ? new Prisma.Decimal(mapped.cost) : undefined,
    courierBookedAt: new Date(),
  };
  if (mapped.trackingNumber) shippingData.trackingNumber = mapped.trackingNumber;
  if (mapped.trackingUrl) shippingData.trackingUrl = mapped.trackingUrl;
  if (newFulfilmentStatus) shippingData.status = newFulfilmentStatus;
  if (mapped.estimatedDeliveryFrom) {
    const parsedEta = new Date(mapped.estimatedDeliveryFrom);
    if (!Number.isNaN(parsedEta.getTime())) shippingData.estimatedDelivery = parsedEta;
  }

  const [updatedOrder, updatedShipping] = await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: newFulfilmentStatus ? { fulfilmentStatus: newFulfilmentStatus } : {},
      select: { orderNumber: true, fulfilmentStatus: true },
    }),
    prisma.shipping.update({
      where: { orderId: order.id },
      data: shippingData,
      select: {
        status: true,
        courierName: true,
        courierProvider: true,
        courierShipmentId: true,
        courierServiceCode: true,
        courierServiceName: true,
        courierCost: true,
        courierBookedAt: true,
        trackingNumber: true,
        trackingUrl: true,
        estimatedDelivery: true,
      },
    }),
  ]);

  return {
    orderNumber: updatedOrder.orderNumber,
    fulfilmentStatus: updatedOrder.fulfilmentStatus,
    shipping: updatedShipping,
  };
}
