// Demo order logic, persisted to Local Storage.
//
// IMPORTANT: this whole checkout is a frontend demo. Orders saved here
// live only in this browser's Local Storage — they are not secure, not
// shared with a server, and not visible to anyone but this browser.
// Real order processing (creating the order, charging the customer,
// notifying the business) must be handled by a backend once one
// exists, and every price/amount must be re-verified server-side
// before real money moves — never trust client-stored totals.

import { getStorageItem, setStorageItem } from "./storage.js";

const ORDERS_KEY = "seasonedz_orders";
const LATEST_ORDER_KEY = "seasonedz_latest_order";

// Payment options shown at checkout. Bank transfer and cash/card on
// delivery both place a real order with the Seasonedz Group backend —
// see js/api/ordersApi.js — but take no online charge through this
// site; payment itself happens by manual bank transfer or on
// delivery. PayFast (Version 3, Milestone 23) is only selectable when
// VITE_PAYFAST_ENABLED="true" — this flag only controls what the
// checkout UI *offers*; the backend independently re-checks its own
// PAYFAST_ENABLED and rejects paymentMethod: PAYFAST regardless of
// what this frontend flag says, so flipping this alone can never let
// a real PayFast order through if the backend isn't also configured
// for it.
const payfastEnabled = (import.meta.env.VITE_PAYFAST_ENABLED || "").toLowerCase() === "true";

export const PAYMENT_METHODS = [
  {
    value: "bank-transfer",
    label: "Bank Transfer",
    description: "Places your order now. We'll send bank details and confirm your order once payment is received.",
  },
  {
    value: "payfast",
    label: payfastEnabled ? "PayFast" : "PayFast (Coming Soon)",
    description: payfastEnabled
      ? "You'll be redirected to PayFast to complete payment."
      : "Real PayFast integration is not connected yet.",
    disabled: !payfastEnabled,
  },
  {
    value: "cash-on-delivery",
    label: "Cash / Card on Delivery",
    description: "Places your order now. Pay the courier when your order arrives.",
  },
];

export function getOrders() {
  return getStorageItem(ORDERS_KEY, []);
}

export function saveOrders(orders) {
  setStorageItem(ORDERS_KEY, orders);
}

export function saveLatestOrderNumber(orderNumber) {
  setStorageItem(LATEST_ORDER_KEY, orderNumber);
}

export function getLatestOrder() {
  const orderNumber = getStorageItem(LATEST_ORDER_KEY, null);
  return orderNumber ? getOrderByNumber(orderNumber) : null;
}

export function getOrderByNumber(orderNumber) {
  return getOrders().find((order) => order.orderNumber === orderNumber) || null;
}

// Readable, professional-looking order number, e.g. "SG-2026-K3F9".
// Regenerates on a collision against existing orders — cheap insurance
// that's more than enough uniqueness for a frontend demo.
export function generateOrderNumber() {
  const year = new Date().getFullYear();
  const existingNumbers = new Set(getOrders().map((order) => order.orderNumber));

  let orderNumber;
  do {
    const code = Math.random().toString(36).slice(2, 6).toUpperCase();
    orderNumber = `SG-${year}-${code}`;
  } while (existingNumbers.has(orderNumber));

  return orderNumber;
}

// ---- Order status / tracking model --------------------------------------
//
// This is a simple, fixed demo status model — it never changes on its
// own. Real order tracking must eventually come from backend order
// records (payment confirmation, warehouse/fulfilment updates) and
// real courier tracking integration (live courier API status and
// location). Do not treat this Local Storage status as authoritative,
// and do not build fake real-time courier tracking on top of it —
// customers should not rely on browser Local Storage for real order
// history once a backend exists.

export const ORDER_STATUSES = [
  {
    key: "order-placed",
    label: "Order Placed",
    message: "We've received your order and it's being processed.",
  },
  {
    key: "order-confirmed",
    label: "Order Confirmed",
    message: "Your order has been confirmed and is in our queue.",
  },
  {
    key: "preparing-order",
    label: "Preparing Your Order",
    message: "We're carefully preparing your items for delivery.",
  },
  {
    key: "ready-for-delivery",
    label: "Ready for Delivery",
    message: "Your order is packed and ready to be handed to our courier.",
  },
  {
    key: "out-for-delivery",
    label: "Out for Delivery",
    message: "Your order is on its way to you.",
  },
  {
    key: "delivered",
    label: "Delivered",
    message: "Your order has been delivered. We hope you love it!",
  },
];

function findStatusIndex(status) {
  const index = ORDER_STATUSES.findIndex((entry) => entry.key === status);
  return index === -1 ? 0 : index;
}

export function getOrderStatusLabel(status) {
  return ORDER_STATUSES.find((entry) => entry.key === status)?.label || status;
}

export function getOrderStatusMessage(status) {
  return ORDER_STATUSES.find((entry) => entry.key === status)?.message || "We'll update your order status here as it progresses.";
}

export function getOrderProgressPercentage(status) {
  return Math.round((findStatusIndex(status) / (ORDER_STATUSES.length - 1)) * 100);
}

// Returns every step with isComplete/isCurrent/isPending flags so the
// tracking page can render a simple, professional-looking progress
// stepper without duplicating this logic.
export function getOrderTrackingSteps(status) {
  const currentIndex = findStatusIndex(status);

  return ORDER_STATUSES.map((entry, index) => ({
    key: entry.key,
    label: entry.label,
    isComplete: index < currentIndex,
    isCurrent: index === currentIndex,
    isPending: index > currentIndex,
  }));
}

// Demo-only helper for previewing the tracking UI at different stages.
// Not wired to any customer-facing control — there is no visible way
// for a customer to change their own order status. Use it directly
// (e.g. from a dev console or a test script) when you need to see how
// the tracking page looks partway through the flow.
export function setOrderStatusForDemo(orderNumber, status) {
  const orders = getOrders();
  const order = orders.find((existing) => existing.orderNumber === orderNumber);
  if (!order) return null;

  order.orderStatus = status;
  saveOrders(orders);
  return order;
}

// Builds and saves a demo order from the current cart/checkout form,
// clears nothing itself (the caller clears the cart) and returns the
// saved order so the caller can redirect to its confirmation page.
export function createOrder({ customer, deliveryAddress, deliveryNotes, paymentMethod, items, subtotal, deliveryFee }) {
  const order = {
    orderNumber: generateOrderNumber(),
    createdAt: new Date().toISOString(),
    customer,
    deliveryAddress,
    deliveryNotes: deliveryNotes || "",
    paymentMethod,
    paymentStatus: "Awaiting Payment",
    orderStatus: "order-placed",
    items,
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    demoNotice:
      "This is a demo order for the Seasonedz Group website preview. No real payment has been taken and no goods will be shipped.",
  };

  const orders = getOrders();
  orders.push(order);
  saveOrders(orders);
  saveLatestOrderNumber(order.orderNumber);

  return order;
}
