// Version 7, Milestone 173: automatic courier delivery status sync —
// the mapping/effects engine behind the Courier Guy (ShipLogic)
// "Tracking event" webhook. See courierWebhook.controller.ts for the
// HTTP endpoint and courierWebhook.service.ts for payload parsing.
//
// STATUS VOCABULARY — IMPORTANT CAVEAT: the raw status strings in
// KNOWN_STATUS_STAGE below come from a current, third-party
// integration's documented ShipLogic/Courier Guy status list, NOT
// from ShipLogic's own official API reference — that reference is a
// JavaScript-rendered site this project's tooling could not access,
// and no working API credentials were available to verify it with one
// real authenticated call either. Treat every mapping below as
// evidence-based, not certified. The design compensates for that
// uncertainty structurally, not by trusting the list harder: an
// unrecognised status is always a safe no-op (logged, never guessed as
// DELIVERED), and every Order.status/Shipping.status change this
// module makes only ever moves forward (see STAGE_RANK), so a wrong or
// out-of-order mapping can delay progress but can never falsely
// regress or falsely advance an order past where the evidence
// supports.
//
// This module NEVER touches: Payment/Order.paymentStatus (PayFast/
// manual payment confirmation own that entirely — see payfast.service.ts
// and adminPaymentConfirmation.service.ts), refunds,
// GuestDownloadToken/digital delivery, or Customer Collection orders
// (applyCourierStatusEvent() below rejects a Collection or
// digital-only order before any write).
import { FulfilmentStatus, OrderStatus, OrderStatusHistorySource, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { ALLOWED_TRANSITIONS } from "./adminOrderStatus.service.js";
import { isDigitalOnlyOrder } from "./courierGuy.service.js";
import { renderAdminDeliveryExceptionEmail, renderCourierCollectedEmail, renderDeliveredEmail, renderOutForDeliveryEmail } from "./email/emailTemplates.js";
import type { OrderEmailData } from "./email/email.types.js";
import { env } from "../config/env.js";
import * as notificationEngine from "./notificationEngine.service.js";

// The seven stages this backend recognises a courier event as meaning.
// Deliberately coarser than ShipLogic's own vocabulary (see brief
// section 11 — "different depot/transit scans -> In Transit") and
// deliberately NOT a 1:1 mirror of any Prisma enum: PRE_TRANSIT/
// IN_TRANSIT collapse onto the existing FulfilmentStatus values
// (PACKING/SHIPPED), OUT_FOR_DELIVERY/DELIVERED map onto the existing
// OrderStatus values, and READY_FOR_PICKUP/EXCEPTION/RETURNED are
// side-branches that intentionally never move Order.status forward.
export type CourierSyncStage = "PRE_TRANSIT" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "READY_FOR_PICKUP" | "EXCEPTION" | "RETURNED";

// See this file's header comment. Every key is lowercase, hyphenated,
// exactly as the evidence source recorded it — the parser
// (courierWebhook.service.ts) lowercases/trims whatever raw status
// string it extracts before looking it up here.
export const KNOWN_STATUS_STAGE: Record<string, CourierSyncStage> = {
  submitted: "PRE_TRANSIT",
  "collection-assigned": "PRE_TRANSIT",
  "awaiting-dropoff": "PRE_TRANSIT",
  collected: "IN_TRANSIT",
  "at-hub": "IN_TRANSIT",
  manifested: "IN_TRANSIT",
  "ready-for-dispatch": "IN_TRANSIT",
  "in-transit": "IN_TRANSIT",
  "at-destination-hub": "IN_TRANSIT",
  "delivery-assigned": "IN_TRANSIT",
  "returned-to-hub": "IN_TRANSIT",
  "out-for-delivery": "OUT_FOR_DELIVERY",
  delivered: "DELIVERED",
  // Explicitly NEVER auto-mapped to DELIVERED — see brief section 15/
  // research: a locker being ready for the customer to collect is not
  // the same fact as the customer having actually collected it, and no
  // further "customer collected" event is known to exist to confirm
  // that. Stays admin-visible-only (lastCourierStatus) until a human
  // confirms delivery for Locker orders, same as today.
  "ready-for-pickup": "READY_FOR_PICKUP",
  cancelled: "EXCEPTION",
  undeliverable: "EXCEPTION",
  "returned-to-sender": "RETURNED",
};

// Only these four stages ever move Order.status/Shipping.status
// forward, and only forward (brief section 19 — out-of-order/delayed
// events must never regress an order). READY_FOR_PICKUP/EXCEPTION are
// intentionally absent (never touch status, ever). RETURNED is handled
// separately below (a terminal side-branch, not part of this ranked
// line).
const STAGE_RANK: Partial<Record<CourierSyncStage, number>> = {
  PRE_TRANSIT: 0,
  IN_TRANSIT: 1,
  OUT_FOR_DELIVERY: 2,
  DELIVERED: 3,
};

// Sanity cross-check (exercised by a unit test): every adjacent pair
// in this forward order must also be a genuinely allowed transition in
// adminOrderStatus.service.ts's own ALLOWED_TRANSITIONS table, so this
// module can never drift from the admin-approved workflow it's
// automating.
export const ORDER_STATUS_FORWARD_LINE: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];

function orderStatusRank(status: OrderStatus): number {
  const index = ORDER_STATUS_FORWARD_LINE.indexOf(status);
  return index; // -1 for CANCELLED/REFUNDED — never on this line.
}

// A single OrderStatusHistory row can jump straight from the order's
// current status to a later status on ORDER_STATUS_FORWARD_LINE (e.g.
// PROCESSING -> DELIVERED in one event, if no separate "out for
// delivery" webhook was ever received for this shipment) — this is
// deliberate: each webhook event is handled as its own, independently
// genuine fact, never backfilled with synthetic intermediate history
// rows for stages nobody actually reported.
async function applySystemOrderStatusTransition(
  tx: Prisma.TransactionClient,
  order: { id: string; orderNumber: string; status: OrderStatus },
  targetStatus: OrderStatus
): Promise<boolean> {
  const currentRank = orderStatusRank(order.status);
  const targetRank = orderStatusRank(targetStatus);
  if (currentRank === -1 || targetRank <= currentRank) {
    return false; // terminal (CANCELLED/REFUNDED), already there, or would regress.
  }
  if (!ALLOWED_TRANSITIONS[order.status]?.length) {
    return false; // defence in depth — order.status has no forward transitions at all.
  }

  await tx.order.update({ where: { id: order.id }, data: { status: targetStatus } });
  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      orderNumberSnapshot: order.orderNumber,
      changedByAdminUserId: null,
      changedByAdminEmailSnapshot: null,
      changedByAdminNameSnapshot: "Courier Guy Automatic Sync (System)",
      oldStatus: order.status,
      newStatus: targetStatus,
      note: null,
      source: OrderStatusHistorySource.SYSTEM,
    },
  });
  return true;
}

export interface CourierStatusEventInput {
  // Candidate shipment identifiers extracted from the webhook payload
  // — courierWebhook.service.ts tries several plausible field names
  // and passes every string it found; this function matches against
  // Shipping.courierShipmentId/trackingNumber and never trusts
  // anything else as an identifier (brief section 5 — "never trust
  // arbitrary order numbers supplied without matching a genuine stored
  // shipment").
  candidateIdentifiers: string[];
  rawStatus: string | null;
  // A provider-reported event time, if the payload genuinely had one
  // and it parsed to a plausible date. Never required — see
  // resolveEventTimestamp() in courierWebhook.service.ts.
  providerEventAt: Date | null;
}

export type CourierStatusEventOutcome =
  | { outcome: "unresolved_shipment" }
  | { outcome: "excluded"; reason: "collection" | "digital_only" | "order_terminal" }
  | { outcome: "unmapped_status"; rawStatus: string }
  | { outcome: "no_op"; stage: CourierSyncStage; reason: "duplicate_or_behind" }
  | { outcome: "informational"; stage: "READY_FOR_PICKUP" | "EXCEPTION"; orderNumber: string }
  | { outcome: "applied"; stage: CourierSyncStage; orderNumber: string; orderStatusChanged: boolean; shippingStatusChanged: boolean };

async function resolveShipmentByIdentifiers(candidateIdentifiers: string[]) {
  const cleaned = [...new Set(candidateIdentifiers.map((id) => id.trim()).filter((id) => id.length > 0))];
  if (cleaned.length === 0) return null;

  const rows = await prisma.shipping.findMany({
    where: { OR: [{ courierShipmentId: { in: cleaned } }, { trackingNumber: { in: cleaned } }] },
    select: {
      id: true,
      status: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          deliveryMethod: true,
          items: { select: { productType: true } },
        },
      },
    },
  });

  // Genuinely ambiguous (should never happen with real provider data —
  // identifiers are provider-issued and expected unique) is treated as
  // unresolved rather than guessing which row is the real one.
  if (rows.length !== 1) return null;
  return rows[0];
}

// The one entry point courierWebhook.controller.ts calls per event.
// Runs in one transaction: resolve shipment, apply exclusion guards,
// map the status, apply effects (or safely no-op). Never throws for a
// business-rule non-match (unresolved shipment, excluded order,
// unmapped status, or an already-seen/behind event) — those are all
// legitimate, expected outcomes for a webhook receiver and are
// returned as a typed result instead, exactly so the controller can
// always respond 200 once the request has passed the secret-path
// gate (see courierWebhook.controller.ts's own comment on why retry
// storms are avoided this way).
// Version 7, Milestone 174B: minimal OrderEmailData mapper for the
// three customer-facing courier templates (courier-collected/out-for-
// delivery/delivered) — none of them read `items`, same reasoning as
// adminOrderStatus.service.ts's own toStatusChangeEmailData(). Always
// called strictly AFTER applyCourierStatusEventTransactional()'s
// transaction has committed (brief section 8/39) — a fresh, plain
// (non-tx) read of the now-genuinely-current order row.
function toCourierEmailData(order: {
  orderNumber: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone: string;
  total: Prisma.Decimal;
  paymentStatus: string;
  paymentMethod: string;
  deliveryMethod: string;
  deliveryFee: Prisma.Decimal;
  collectionCity: string | null;
  deliveryStreetAddress: string | null;
  deliverySuburb: string | null;
  deliveryCity: string | null;
  deliveryProvince: string | null;
  deliveryPostalCode: string | null;
  deliveryNotes: string | null;
}): OrderEmailData {
  return {
    orderNumber: order.orderNumber,
    customerFirstName: order.customerFirstName,
    customerLastName: order.customerLastName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    total: order.total.toNumber(),
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    items: [],
    deliveryMethod: order.deliveryMethod,
    deliveryFee: order.deliveryFee.toNumber(),
    collectionCity: order.collectionCity,
    deliveryStreetAddress: order.deliveryStreetAddress,
    deliverySuburb: order.deliverySuburb,
    deliveryCity: order.deliveryCity,
    deliveryProvince: order.deliveryProvince,
    deliveryPostalCode: order.deliveryPostalCode,
    deliveryNotes: order.deliveryNotes,
  };
}

// Version 7, Milestone 174B: fires the one customer notification each
// meaningful stage transition deserves (brief section 22 — never one
// per repeated provider scan, which the rank-based idempotency this
// event already went through upstream naturally guarantees: this is
// only ever called once a genuine, non-duplicate "applied"/
// "informational" outcome has already been decided) plus the admin
// delivery-exception alert for a genuine EXCEPTION or RETURNED stage.
// Strictly AFTER the transaction has committed — see this file's own
// header comment on why courierStatusSync never enqueues from inside
// applyCourierStatusEventTransactional()'s $transaction callback.
async function notifyCourierStatusChange(outcome: CourierStatusEventOutcome, rawStatus: string | null): Promise<void> {
  if (outcome.outcome === "informational" && outcome.stage === "EXCEPTION") {
    await notificationEngine.enqueueAndSendNow({
      eventType: "ADMIN_DELIVERY_EXCEPTION",
      templateName: "admin-delivery-exception",
      recipientEmail: env.adminNotificationEmail,
      orderNumber: outcome.orderNumber,
      dedupeKey: `ADMIN_DELIVERY_EXCEPTION:${outcome.orderNumber}:${rawStatus ?? "unknown"}`,
      rendered: renderAdminDeliveryExceptionEmail({ orderNumber: outcome.orderNumber, rawCourierStatus: rawStatus ?? "unknown" }),
    });
    return;
  }

  if (outcome.outcome !== "applied") return;

  const order = await prisma.order.findUnique({ where: { orderNumber: outcome.orderNumber } });
  if (!order) return;
  const emailData = toCourierEmailData(order);

  if (outcome.stage === "IN_TRANSIT" && outcome.shippingStatusChanged) {
    await notificationEngine.enqueueAndSendNow({
      eventType: "COURIER_COLLECTED",
      templateName: "courier-collected",
      recipientEmail: emailData.customerEmail,
      orderNumber: outcome.orderNumber,
      dedupeKey: `COURIER_COLLECTED:${outcome.orderNumber}`,
      rendered: renderCourierCollectedEmail(emailData),
    });
  } else if (outcome.stage === "OUT_FOR_DELIVERY" && outcome.orderStatusChanged) {
    await notificationEngine.enqueueAndSendNow({
      eventType: "OUT_FOR_DELIVERY",
      templateName: "out-for-delivery",
      recipientEmail: emailData.customerEmail,
      orderNumber: outcome.orderNumber,
      dedupeKey: `OUT_FOR_DELIVERY:${outcome.orderNumber}`,
      rendered: renderOutForDeliveryEmail(emailData),
    });
  } else if (outcome.stage === "DELIVERED" && outcome.orderStatusChanged) {
    await notificationEngine.enqueueAndSendNow({
      eventType: "DELIVERED",
      templateName: "delivered",
      recipientEmail: emailData.customerEmail,
      orderNumber: outcome.orderNumber,
      dedupeKey: `DELIVERED:${outcome.orderNumber}`,
      rendered: renderDeliveredEmail(emailData),
    });
  } else if (outcome.stage === "RETURNED") {
    await notificationEngine.enqueueAndSendNow({
      eventType: "ADMIN_DELIVERY_EXCEPTION",
      templateName: "admin-delivery-exception",
      recipientEmail: env.adminNotificationEmail,
      orderNumber: outcome.orderNumber,
      dedupeKey: `ADMIN_DELIVERY_EXCEPTION:${outcome.orderNumber}:returned-to-sender`,
      rendered: renderAdminDeliveryExceptionEmail({ orderNumber: outcome.orderNumber, rawCourierStatus: rawStatus ?? "returned-to-sender" }),
    });
  }
}

export async function applyCourierStatusEvent(input: CourierStatusEventInput): Promise<CourierStatusEventOutcome> {
  const outcome = await applyCourierStatusEventTransactional(input);

  void notifyCourierStatusChange(outcome, input.rawStatus).catch((error) => {
    console.warn(`[notifications] failed to notify courier status change: ${error instanceof Error ? error.message : "Unknown error"}`);
  });

  return outcome;
}

async function applyCourierStatusEventTransactional(input: CourierStatusEventInput): Promise<CourierStatusEventOutcome> {
  return prisma.$transaction(async (tx) => {
    const shipment = await resolveShipmentByIdentifiers(input.candidateIdentifiers);
    if (!shipment) {
      return { outcome: "unresolved_shipment" };
    }

    // Brief section 7/8: Customer Collection and digital-only orders
    // must never enter courier tracking. In practice a Collection or
    // digital-only order never has a courierShipmentId/trackingNumber
    // in the first place (nothing in this codebase ever books a real
    // Courier Guy shipment for one), so resolveShipmentByIdentifiers()
    // already can't match one — these checks are deliberate defence in
    // depth, not the primary protection.
    if (shipment.order.deliveryMethod === "COLLECTION") {
      return { outcome: "excluded", reason: "collection" };
    }
    if (isDigitalOnlyOrder(shipment.order.items)) {
      return { outcome: "excluded", reason: "digital_only" };
    }
    // A CANCELLED/REFUNDED order must stay exactly as an admin left it
    // — not just Order.status (already enforced by
    // applySystemOrderStatusTransition()'s own orderStatusRank() === -1
    // guard below) but Shipping.status too, which that guard alone
    // doesn't cover. Without this, a courier event arriving after
    // cancellation (a real possibility — cancellation doesn't cancel
    // the real-world shipment, see courierGuy.service.ts's own
    // "rollback" warning) could still flip Shipping.status to
    // SHIPPED/DELIVERED on a cancelled order, which no admin screen
    // expects to see. lastCourierStatus is still recorded below
    // regardless (an admin may genuinely want to know the courier
    // delivered something Seasonedz had already cancelled).
    if (shipment.order.status === OrderStatus.CANCELLED || shipment.order.status === OrderStatus.REFUNDED) {
      if (input.rawStatus?.trim()) {
        await tx.shipping.update({ where: { id: shipment.id }, data: { lastCourierStatus: input.rawStatus.trim().toLowerCase(), lastCourierStatusAt: new Date() } });
      }
      return { outcome: "excluded", reason: "order_terminal" };
    }

    const rawStatus = input.rawStatus?.trim().toLowerCase() ?? null;
    const stage = rawStatus ? KNOWN_STATUS_STAGE[rawStatus] : undefined;

    // Every code path below issues at most ONE tx.shipping.update() —
    // lastCourierStatus/lastCourierStatusAt (admin visibility, always
    // safe, recorded for every rawStatus regardless of outcome) is
    // merged into the same write as any real status/deliveredAt change
    // this event also causes, rather than two separate calls.
    const shippingUpdateData: { lastCourierStatus?: string; lastCourierStatusAt?: Date; status?: FulfilmentStatus; deliveredAt?: Date } = {};
    if (rawStatus) {
      shippingUpdateData.lastCourierStatus = rawStatus;
      shippingUpdateData.lastCourierStatusAt = new Date();
    }

    const shippingId = shipment.id;
    async function flushShippingUpdate(): Promise<void> {
      if (Object.keys(shippingUpdateData).length === 0) return;
      await tx.shipping.update({ where: { id: shippingId }, data: shippingUpdateData });
    }

    if (!rawStatus || !stage) {
      await flushShippingUpdate();
      return { outcome: "unmapped_status", rawStatus: rawStatus ?? "" };
    }

    if (stage === "READY_FOR_PICKUP" || stage === "EXCEPTION") {
      // Informational only. Brief section 16: admin visibility is the
      // "handling" for these, not a status change (never DELIVERED,
      // never CANCELLED automatically).
      await flushShippingUpdate();
      return { outcome: "informational", stage, orderNumber: shipment.order.orderNumber };
    }

    if (stage === "RETURNED") {
      // Brief section 17: preserve distinctly from delivered, never
      // auto-refund. Once genuinely delivered, a later "returned"
      // event for the same shipment is treated as suspect/stale rather
      // than reopening a completed order — logged as a no-op for
      // admin review, never silently overwritten.
      if (shipment.status === FulfilmentStatus.DELIVERED || shipment.order.status === OrderStatus.DELIVERED || shipment.status === FulfilmentStatus.RETURNED) {
        await flushShippingUpdate();
        return { outcome: "no_op", stage, reason: "duplicate_or_behind" };
      }
      shippingUpdateData.status = FulfilmentStatus.RETURNED;
      await flushShippingUpdate();
      return { outcome: "applied", stage, orderNumber: shipment.order.orderNumber, orderStatusChanged: false, shippingStatusChanged: true };
    }

    // Forward-line stages: PRE_TRANSIT / IN_TRANSIT / OUT_FOR_DELIVERY / DELIVERED.
    const targetRank = STAGE_RANK[stage]!;
    const currentRank = currentStageRank(shipment.order.status, shipment.status);
    if (targetRank <= currentRank) {
      await flushShippingUpdate();
      return { outcome: "no_op", stage, reason: "duplicate_or_behind" };
    }

    let shippingStatusChanged = false;
    let orderStatusChanged = false;

    // Shipping.status (FulfilmentStatus) reflects the highest stage
    // ever confirmed for this shipment — a plain overwrite, safe to
    // set directly to the furthest point this single event implies
    // (e.g. straight to DELIVERED even if it was never explicitly seen
    // at SHIPPED), unlike Order.status below, which needs an audited
    // history row per genuine transition.
    if (targetRank >= 3) {
      shippingUpdateData.status = FulfilmentStatus.DELIVERED;
      shippingUpdateData.deliveredAt = input.providerEventAt ?? new Date();
      shippingStatusChanged = true;
    } else if (targetRank >= 1 && shipment.status !== FulfilmentStatus.SHIPPED) {
      shippingUpdateData.status = FulfilmentStatus.SHIPPED;
      shippingStatusChanged = true;
    }
    await flushShippingUpdate();

    // Order.status: exactly ONE audited transition per event, jumping
    // directly from whatever the order's current status is to the
    // single target this event's stage represents (never a synthetic
    // intermediate OUT_FOR_DELIVERY row fabricated on the way to a
    // DELIVERED event that never separately reported it — see this
    // file's header comment).
    if (stage === "OUT_FOR_DELIVERY") {
      orderStatusChanged = await applySystemOrderStatusTransition(tx, shipment.order, OrderStatus.OUT_FOR_DELIVERY);
    } else if (stage === "DELIVERED") {
      orderStatusChanged = await applySystemOrderStatusTransition(tx, shipment.order, OrderStatus.DELIVERED);
    }

    return { outcome: "applied", stage, orderNumber: shipment.order.orderNumber, orderStatusChanged, shippingStatusChanged };
  });
}

function currentStageRank(orderStatus: OrderStatus, shippingStatus: FulfilmentStatus): number {
  // RETURNED is terminal (brief section 17/19): once set, no later
  // forward-line event (even a genuine "delivered") may move the
  // shipment again — reusing DELIVERED's own ceiling rank blocks every
  // forward-line comparison below (`targetRank <= currentRank`) the
  // same way an already-DELIVERED shipment blocks them.
  if (shippingStatus === FulfilmentStatus.RETURNED) return 3;
  if (shippingStatus === FulfilmentStatus.DELIVERED || orderStatus === OrderStatus.DELIVERED) return 3;
  if (orderStatus === OrderStatus.OUT_FOR_DELIVERY) return 2;
  if (shippingStatus === FulfilmentStatus.SHIPPED) return 1;
  return 0;
}
