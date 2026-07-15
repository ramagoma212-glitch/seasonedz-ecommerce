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
  | "payment-confirmed"
  | "payment-failed-or-cancelled"
  | "admin-new-order"
  | "admin-new-enquiry";

export interface RenderedEmail {
  subject: string;
  body: string;
}

export interface OrderEmailData {
  orderNumber: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  total: number;
  paymentStatus: string;
  paymentMethod: string;
}

export interface EnquiryEmailData {
  id: string;
  type: string;
  name: string;
  email: string;
  message: string;
}
