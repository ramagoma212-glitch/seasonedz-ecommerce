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
  | "admin-new-enquiry";

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
  deliveryStreetAddress: string;
  deliverySuburb: string;
  deliveryCity: string;
  deliveryProvince: string;
  deliveryPostalCode: string;
  deliveryNotes: string | null;
}

export interface EnquiryEmailData {
  id: string;
  type: string;
  name: string;
  email: string;
  message: string;
}
