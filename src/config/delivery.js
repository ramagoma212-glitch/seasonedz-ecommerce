// Delivery configuration (Version 7, Milestone 168C; registered-
// customer distinction removed and real amounts made admin-editable,
// Milestone 205).
//
// These constants are now FALLBACK DEFAULTS only, used until the real,
// admin-editable values load from the backend (see
// js/deliverySettingsCache.js, Milestone 205) — matches the backend's
// own config/delivery.ts, which documents the identical fallback role.
// Keep these in sync with that file's own constants so the two can
// never quietly drift apart (both get updated together whenever the
// admin-configured defaults change).
//
// `calculateDeliveryFee()` below is a display-only estimate — the
// backend independently recomputes and validates every fee itself from
// verified DB-priced items and its own DeliverySettings row; nothing
// here is ever trusted by the backend, matching the existing "client
// shows an estimate, server decides the real charge" discipline
// already used for gift wrapping (js/cart.js's GIFT_WRAP_FEE_PER_ITEM).
//
// Milestone 205 (owner-approved — see "Website Fixes" developer
// brief, Task 1): lowered Locker R100->R60 and Door R120->R90, and
// replaced the old two-tier guest/registered threshold with ONE
// universal R350 threshold that applies identically to every
// customer — the former REGISTERED_FREE_DELIVERY_THRESHOLD constant
// was removed along with the distinction itself, not just renamed.

export const COURIER_LOCKER_FEE = 60;
export const COURIER_DOOR_FEE = 90;
export const COLLECTION_FEE = 0;
export const FREE_DELIVERY_THRESHOLD = 350;

export const DELIVERY_METHODS = [
  { value: "COURIER_LOCKER", label: "Courier Guy Locker to Locker", fee: COURIER_LOCKER_FEE },
  { value: "COURIER_DOOR", label: "Courier Guy Door to Door", fee: COURIER_DOOR_FEE },
  { value: "COLLECTION", label: "Customer Collection", fee: COLLECTION_FEE },
];

export const COLLECTION_CITIES = ["Pretoria", "Thohoyandou"];

export function getDeliveryMethodLabel(method) {
  return DELIVERY_METHODS.find((entry) => entry.value === method)?.label || method;
}

// `physicalSubtotal` must be the qualifying subtotal only — physical
// products' line totals, excluding gift wrapping and excluding any
// delivery fee itself (see js/cart.js's getCartPhysicalSubtotal()).
//
// Milestone 205: `rates` is an optional override — {courierLockerFee,
// courierDoorFee, freeDeliveryThreshold} — supplied by
// js/deliverySettingsCache.js once the real admin-configured values
// have loaded. Every call site that omits it (or calls before the
// cache has loaded) keeps reading the fallback constants above,
// unchanged. `isRegisteredCustomer` is kept only for call-site
// compatibility — Milestone 205 removed the registered/guest
// distinction, so it no longer changes the outcome.
export function calculateDeliveryFee(method, physicalSubtotal, hasPhysicalItems = true, isRegisteredCustomer = false, rates = null) {
  if (!hasPhysicalItems) return 0;
  void isRegisteredCustomer;
  const lockerFee = rates?.courierLockerFee ?? COURIER_LOCKER_FEE;
  const doorFee = rates?.courierDoorFee ?? COURIER_DOOR_FEE;
  const threshold = rates?.freeDeliveryThreshold ?? FREE_DELIVERY_THRESHOLD;
  const qualifiesForFree = physicalSubtotal >= threshold;

  switch (method) {
    case "COLLECTION":
      return 0;
    case "COURIER_LOCKER":
      return qualifiesForFree ? 0 : lockerFee;
    case "COURIER_DOOR":
      return qualifiesForFree ? 0 : doorFee;
    default:
      return 0;
  }
}
