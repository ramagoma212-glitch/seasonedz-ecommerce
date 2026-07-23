// Version 7, Milestone 59: read-only admin dashboard data. Every
// function here is a query — none of them write to the database. Order
// detail reuses order.service.ts's existing getOrderByNumber(), which
// already builds its output field-by-field (no internal ids, no
// costPrice) — the same safe shape this milestone needs, not
// duplicated here.

import { EnquiryStatus, EnquiryType, OrderStatus, PaymentMethod, PaymentStatus, Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";

const RECENT_ORDERS_LIMIT = 10;
const RECENT_ENQUIRIES_LIMIT = 10;
const MESSAGE_PREVIEW_LENGTH = 140;

// Static, honest text describing today's real (manual) operational
// process — matches VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md. Nothing
// here is derived from data or actionable from the dashboard itself;
// no button, no automation — see VERSION_7_ADMIN_DASHBOARD_PLAN.md's
// "Read Only First Approach".
const MANUAL_REMINDERS: readonly string[] = [
  "Check pending Bank Transfer payments against the bank account.",
  "Confirm delivery details before packing each order.",
  "Pack confirmed orders.",
  "Book courier manually — no courier API is connected yet.",
  "Respond to new enquiries.",
];

// Products a "low stock" view should surface — draft/archived products
// aren't customer-facing, so restocking them isn't an operational
// concern the same way. Matches the storefront's own VISIBLE_STATUSES
// concept in product.service.ts.
const LOW_STOCK_VISIBLE_STATUSES: ProductStatus[] = [ProductStatus.ACTIVE, ProductStatus.OUT_OF_STOCK];

const orderListSelect = {
  orderNumber: true,
  customerFirstName: true,
  customerLastName: true,
  customerEmail: true,
  customerPhone: true,
  total: true,
  paymentMethod: true,
  paymentStatus: true,
  status: true,
  createdAt: true,
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

type OrderListRow = Prisma.OrderGetPayload<{ select: typeof orderListSelect }>;

export interface AdminOrderListItem {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  createdAt: Date;
  itemCount: number;
}

function toAdminOrderListItem(order: OrderListRow): AdminOrderListItem {
  return {
    orderNumber: order.orderNumber,
    customerName: `${order.customerFirstName} ${order.customerLastName}`.trim(),
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    total: order.total.toNumber(),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    createdAt: order.createdAt,
    itemCount: order._count.items,
  };
}

const enquiryListSelect = {
  id: true,
  type: true,
  status: true,
  name: true,
  email: true,
  phone: true,
  companyName: true,
  subject: true,
  message: true,
  createdAt: true,
} satisfies Prisma.EnquirySelect;

type EnquiryListRow = Prisma.EnquiryGetPayload<{ select: typeof enquiryListSelect }>;

export interface AdminEnquiryListItem {
  id: string;
  type: EnquiryType;
  status: EnquiryStatus;
  name: string;
  email: string;
  phone: string | null;
  subjectOrCompany: string | null;
  messagePreview: string;
  createdAt: Date;
}

function truncateMessage(message: string): string {
  if (message.length <= MESSAGE_PREVIEW_LENGTH) return message;
  return `${message.slice(0, MESSAGE_PREVIEW_LENGTH).trimEnd()}…`;
}

function toAdminEnquiryListItem(enquiry: EnquiryListRow): AdminEnquiryListItem {
  return {
    id: enquiry.id,
    type: enquiry.type,
    status: enquiry.status,
    name: enquiry.name,
    email: enquiry.email,
    phone: enquiry.phone,
    subjectOrCompany: enquiry.subject ?? enquiry.companyName ?? null,
    messagePreview: truncateMessage(enquiry.message),
    createdAt: enquiry.createdAt,
  };
}

export interface AdminLowStockProduct {
  name: string;
  sku: string | null;
  slug: string;
  stockQuantity: number;
  lowStockThreshold: number;
  status: ProductStatus;
}

// Prisma can't compare two columns of the same row in a `where` clause
// without raw SQL, and the product catalogue is small — so this filters
// in JS after fetching, same approach product.service.ts's own
// deriveStockStatus() already uses for the equivalent customer-facing
// "Low Stock" label.
export async function getLowStockProducts(): Promise<AdminLowStockProduct[]> {
  const products = await prisma.product.findMany({
    where: { status: { in: LOW_STOCK_VISIBLE_STATUSES } },
    select: { name: true, sku: true, slug: true, stockQuantity: true, lowStockThreshold: true, status: true },
    orderBy: { stockQuantity: "asc" },
  });

  return products.filter((product) => product.stockQuantity <= product.lowStockThreshold);
}

export interface AdminDashboardOverview {
  counts: {
    totalOrders: number;
    pendingOrders: number;
    paidOrders: number;
  };
  recentOrders: AdminOrderListItem[];
  recentEnquiries: AdminEnquiryListItem[];
  lowStockProducts: AdminLowStockProduct[];
  manualReminders: readonly string[];
}

export async function getDashboardOverview(): Promise<AdminDashboardOverview> {
  const [totalOrders, pendingOrders, paidOrders, recentOrders, recentEnquiries, lowStockProducts] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { paymentStatus: PaymentStatus.PENDING } }),
    prisma.order.count({ where: { paymentStatus: PaymentStatus.PAID } }),
    prisma.order.findMany({ select: orderListSelect, orderBy: { createdAt: "desc" }, take: RECENT_ORDERS_LIMIT }),
    prisma.enquiry.findMany({ select: enquiryListSelect, orderBy: { createdAt: "desc" }, take: RECENT_ENQUIRIES_LIMIT }),
    getLowStockProducts(),
  ]);

  return {
    counts: { totalOrders, pendingOrders, paidOrders },
    recentOrders: recentOrders.map(toAdminOrderListItem),
    recentEnquiries: recentEnquiries.map(toAdminEnquiryListItem),
    lowStockProducts,
    manualReminders: MANUAL_REMINDERS,
  };
}

export interface AdminOrderListFilters {
  page: number;
  limit: number;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
}

export interface AdminOrderListResult {
  orders: AdminOrderListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function listOrdersForAdmin(filters: AdminOrderListFilters): Promise<AdminOrderListResult> {
  const where: Prisma.OrderWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus;

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      select: orderListSelect,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return {
    orders: orders.map(toAdminOrderListItem),
    total,
    page: filters.page,
    limit: filters.limit,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
  };
}

export interface AdminEnquiryListFilters {
  page: number;
  limit: number;
  type?: EnquiryType;
  status?: EnquiryStatus;
}

export interface AdminEnquiryListResult {
  enquiries: AdminEnquiryListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function listEnquiriesForAdmin(filters: AdminEnquiryListFilters): Promise<AdminEnquiryListResult> {
  const where: Prisma.EnquiryWhereInput = {};
  if (filters.type) where.type = filters.type;
  if (filters.status) where.status = filters.status;

  const [total, enquiries] = await Promise.all([
    prisma.enquiry.count({ where }),
    prisma.enquiry.findMany({
      where,
      select: enquiryListSelect,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return {
    enquiries: enquiries.map(toAdminEnquiryListItem),
    total,
    page: filters.page,
    limit: filters.limit,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
  };
}

export interface CourierBookingFields {
  courierProvider: string | null;
  courierShipmentId: string | null;
  courierServiceCode: string | null;
  courierServiceName: string | null;
  courierCost: number | null;
  courierBookedAt: Date | null;
}

// Version 7, Milestone 112: the admin order detail view needs the
// Courier Guy booking fields (courierShipmentId/courierCost/etc.),
// but order.service.ts's getOrderByNumber()/toOrderOutput() is shared
// with the public, unauthenticated customer order-tracking endpoint —
// adding these fields there would leak an internal shipment ID and
// what Seasonedz Group actually pays for courier to any customer who
// knows their own order number. This is a small, admin-only
// augmentation queried separately and merged into the response only
// by adminDashboard.controller.ts's getOrderDetailHandler, never
// touching the shared customer-facing shape.
export async function getCourierBookingFieldsForOrder(orderNumber: string): Promise<CourierBookingFields | null> {
  const shipping = await prisma.shipping.findFirst({
    where: { order: { orderNumber } },
    select: {
      courierProvider: true,
      courierShipmentId: true,
      courierServiceCode: true,
      courierServiceName: true,
      courierCost: true,
      courierBookedAt: true,
    },
  });

  if (!shipping) return null;

  return {
    courierProvider: shipping.courierProvider,
    courierShipmentId: shipping.courierShipmentId,
    courierServiceCode: shipping.courierServiceCode,
    courierServiceName: shipping.courierServiceName,
    courierCost: shipping.courierCost ? Number(shipping.courierCost) : null,
    courierBookedAt: shipping.courierBookedAt,
  };
}
