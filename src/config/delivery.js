// Delivery configuration (Version 7, Milestone 168C).
//
// Single source of truth for the FRONTEND's display-only delivery
// estimate — mirrors backend/src/config/delivery.ts. The backend
// independently recomputes and validates every fee itself from
// verified DB-priced items server-side; nothing here is ever trusted
// by the backend, matching the existing "client shows an estimate,
// server decides the real charge" discipline already used for gift
// wrapping (js/cart.js's GIFT_WRAP_FEE_PER_ITEM).
//
// Replaces the old single "R80 flat fee, free at R650 for registered
// customers only" rule with three owner-approved fulfilment methods
// and a universal (guest-or-registered) R600 threshold.

export const COURIER_LOCKER_FEE = 100;
export const COURIER_DOOR_FEE = 120;
export const COLLECTION_FEE = 0;
export const FREE_DELIVERY_THRESHOLD = 600;

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
export function calculateDeliveryFee(method, physicalSubtotal, hasPhysicalItems = true) {
  if (!hasPhysicalItems) return 0;
  const qualifiesForFree = physicalSubtotal >= FREE_DELIVERY_THRESHOLD;

  switch (method) {
    case "COLLECTION":
      return 0;
    case "COURIER_LOCKER":
      return qualifiesForFree ? 0 : COURIER_LOCKER_FEE;
    case "COURIER_DOOR":
      return qualifiesForFree ? 0 : COURIER_DOOR_FEE;
    default:
      return 0;
  }
}
