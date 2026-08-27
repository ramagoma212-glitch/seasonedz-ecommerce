// Shared types for the email service (Version 3, Milestone 24 —
// preparation only). Nothing here sends anything; see email.service.ts
// and backend/EMAIL_SETUP.md.
//
// OrderEmailData/EnquiryEmailData are deliberately their own small,
// self-contained shapes — not a direct re-export of
// order.service.ts's OrderOutput or enquiry.service.ts's
// EnquiryCreateOutput — since a template only ever needs a handful of
// fields, and keeping this module's input shape independent avoids
// coupling the email layer to those services' internal output shapes.
// Whatever milestone wires real sending later maps from the real
// Order/Enquiry record onto these before calling a send*Email function.

export type EmailTemplateName =
  | "order-created"
  | "payment-pending"
  | "payment-confirmed"
  | "payment-failed-or-cancelled"
  | "enquiry-received"
  | "admin-new-order"
  | "admin-new-enquiry"
  | "password-reset"
  // Version 7, Milestone 174B: routed through notificationEngine.service.ts,
  // not called directly — see that file's own header comment.
  | "order-processing"
  | "order-cancelled"
  | "courier-collected"
  | "out-for-delivery"
  | "delivered"
  | "admin-delivery-exception"
  | "affiliate-application-received"
  | "admin-new-affiliate"
  | "affiliate-approved"
  | "affiliate-rejected"
  | "affiliate-suspended"
  | "commission-approved"
  | "payout-recorded"
  | "admin-new-review"
  // Version 7, Milestone 174C.
  | "product-review-request"
  | "product-review-reminder"
  | "stock-alert"
  | "wishlist-stock-alert"
  | "abandoned-checkout-reminder";

// Which side of the conversation a template's recipient is — used only
// for dry-run log clarity (see email.service.ts's logConsoleEmail),
// never to change what actually gets sent.
export type EmailRecipientRole = "customer" | "admin";

export interface RenderedEmail {
  subject: string;
  body: string;
}

// Version 7, Milestone 117: minimal per-line-item shape a template
// needs — deliberately not OrderItemOutput (order.service.ts), same
// "independent small shape" reasoning as OrderEmailData itself.
export interface OrderEmailItem {
  productName: string;
  quantity: number;
  lineTotal: number;
}

export interface OrderEmailData {
  orderNumber: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  // Version 7, Milestone 117: added for the admin new-order alert
  // (contacting the customer directly, e.g. to confirm a bank
  // transfer) and for a fuller order-created email.
  customerPhone: string;
  total: number;
  paymentStatus: string;
  paymentMethod: string;
  items: OrderEmailItem[];
  // Version 7, Milestone 168C: which of the three owner-approved
  // fulfilment methods was chosen ("COURIER_LOCKER" | "COURIER_DOOR" |
  // "COLLECTION"), its fee, and — for COLLECTION only — the chosen
  // city. Address fields below are null for COLLECTION orders (there
  // is no physical delivery address to show).
  deliveryMethod: string;
  deliveryFee: number;
  collectionCity: string | null;
  deliveryStreetAddress: string | null;
  deliverySuburb: string | null;
  deliveryCity: string | null;
  deliveryProvince: string | null;
  deliveryPostalCode: string | null;
  deliveryNotes: string | null;
  // Version 7, Milestone 152: secure digital downloads. hasDigitalItems
  // is safe to compute and include on every order email (it's just
  // "does this order contain a digital line item", never a download
  // link itself). guestDownloadUrl is deliberately optional and only
  // ever set by payfast.service.ts's own COMPLETE handling, after
  // payment is genuinely confirmed PAID, and only for a guest
  // (customerId-less) order — see that file's own comment. Never set
  // on the immediate order-created email (payment isn't confirmed yet)
  // and never set for a logged-in customer's order (they download via
  // their account instead of a token link).
  hasDigitalItems?: boolean;
  guestDownloadUrl?: string;
}

export interface EnquiryEmailData {
  id: string;
  type: string;
  name: string;
  email: string;
  message: string;
}

// Version 7, Milestone 132: deliberately narrow, same "independent
// small shape" reasoning as the two above — resetUrl already contains
// the raw token (it's the only place the raw token ever appears
// outside the customer_session-style hashing discipline), so this
// interface itself carries no other sensitive field.
export interface PasswordResetEmailData {
  customerFirstName: string;
  customerEmail: string;
  resetUrl: string;
}

// Version 7, Milestone 174B: courier/delivery-stage emails reuse
// OrderEmailData as-is (same "who/what order/delivery method" shape
// already covers it) — no separate courier data type needed.

// Version 7, Milestone 174B: an admin-facing alert for a courier
// exception/return status — deliberately narrow, admin-only, never
// sent to a customer (see courierStatusSync.service.ts's own
// EXCEPTION/RETURNED handling — customer messaging for these stays
// conservative, see notificationEngine.service.ts).
export interface AdminDeliveryExceptionEmailData {
  orderNumber: string;
  rawCourierStatus: string;
}

// Version 7, Milestone 174B: shared shape for every affiliate lifecycle
// email (application received, approved, rejected, suspended) —
// referralCode/referralLink/rates are only ever populated once genuine
// (i.e. only for "approved"; every other status leaves them undefined
// rather than guessing).
export interface AffiliateEmailData {
  affiliateName: string;
  affiliateEmail: string;
  referralCode?: string;
  referralLink?: string;
  effectiveCommissionRate?: number;
  effectiveDiscountRate?: number;
}

export interface CommissionEmailData {
  affiliateName: string;
  affiliateEmail: string;
  orderNumber: string;
  commissionAmount: number;
}

export interface PayoutEmailData {
  affiliateName: string;
  affiliateEmail: string;
  amountPaid: number;
  paidAt: Date;
}

// Version 7, Milestone 174B: admin-facing only. reviewText is the
// customer's own free text, included verbatim — safe here only because
// every template body is plain text (Brevo's textContent field, never
// HTML), so there's no markup for it to break out of, same as
// enquiry.message already being included verbatim in
// renderEnquiryReceivedEmail/renderAdminNewEnquiryEmail today.
export interface AdminNewReviewEmailData {
  productName: string;
  customerName: string;
  rating: number;
  reviewText: string;
}

// Version 7, Milestone 174C: shared shape for both the initial review
// request and its one reminder — see productReviewRequest.service.ts.
// `products` only ever lists products still genuinely unreviewed at
// the moment this was rendered (never the full original purchase
// list) — see that file's own "already reviewed" re-check.
// reviewUrl always points at the customer's own order detail page
// (/account/orders/:orderNumber, where the existing review prompt
// already lives), never a generic Shop page and never a per-product
// URL carrying any customer identity — see that file's own comment.
export interface ProductReviewRequestEmailData {
  customerFirstName: string;
  orderNumber: string;
  products: { productName: string }[];
  reviewUrl: string;
  isReminder: boolean;
}

// Version 7, Milestone 174C.
export interface StockAlertEmailData {
  customerFirstName: string;
  productName: string;
  productUrl: string;
}

// Version 7, Milestone 174C: deliberately narrow — see
// checkoutIntent.service.ts's own comment on why no price/discount/
// urgency claim is ever included.
export interface AbandonedCheckoutEmailData {
  customerFirstName: string | null;
  recoveryUrl: string;
}
