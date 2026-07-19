// Version 7, Milestone 59: read-only admin dashboard endpoints. Every
// handler here is a GET — no create/update/delete. Every route this
// controller serves is mounted behind requireAdminAuth (see
// adminDashboard.routes.ts), so req.adminUser is always set by the
// time a handler runs, but no handler here ever returns adminUser
// itself or any credential-shaped field.

import type { NextFunction, Request, Response } from "express";
import { EnquiryStatus, EnquiryType, OrderStatus, PaymentStatus } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { parsePositiveIntParam } from "../utils/query.js";
import * as adminDashboardService from "../services/adminDashboard.service.js";
import { getOrderByNumber } from "../services/order.service.js";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

function parsePage(raw: unknown): number {
  return parsePositiveIntParam(raw) ?? 1;
}

function parseLimit(raw: unknown): number {
  const requested = parsePositiveIntParam(raw) ?? DEFAULT_LIST_LIMIT;
  return Math.min(requested, MAX_LIST_LIMIT);
}

// Same forgiving convention as parseSortParam/parseStockParam in
// query.ts — an unrecognised or absent status value means "no filter",
// never an error, since this is a read-only convenience filter.
function parseOrderStatus(raw: unknown): OrderStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && (Object.values(OrderStatus) as string[]).includes(value)
    ? (value as OrderStatus)
    : undefined;
}

function parsePaymentStatus(raw: unknown): PaymentStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && (Object.values(PaymentStatus) as string[]).includes(value)
    ? (value as PaymentStatus)
    : undefined;
}

function parseEnquiryType(raw: unknown): EnquiryType | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && (Object.values(EnquiryType) as string[]).includes(value)
    ? (value as EnquiryType)
    : undefined;
}

function parseEnquiryStatus(raw: unknown): EnquiryStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && (Object.values(EnquiryStatus) as string[]).includes(value)
    ? (value as EnquiryStatus)
    : undefined;
}

export async function getDashboardHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const overview = await adminDashboardService.getDashboardOverview();
    sendSuccess(res, { message: "Admin dashboard retrieved successfully", data: overview });
  } catch (error) {
    next(error);
  }
}

export async function listOrdersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const status = parseOrderStatus(req.query.status);
    const paymentStatus = parsePaymentStatus(req.query.paymentStatus);

    const result = await adminDashboardService.listOrdersForAdmin({ page, limit, status, paymentStatus });
    sendSuccess(res, { message: "Orders retrieved successfully", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getOrderDetailHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { orderNumber } = req.params;
    if (!orderNumber) {
      sendError(res, { message: "Order number is required", statusCode: 400 });
      return;
    }

    // Reuses the exact same safe shape the (unauthenticated,
    // order-number-gated) customer-facing order lookup already
    // returns — order.service.ts's getOrderByNumber() already builds
    // its output field-by-field with no internal ids, so there's
    // nothing extra to strip for the admin view.
    const order = await getOrderByNumber(orderNumber);
    if (!order) {
      sendError(res, { message: `Order not found: ${orderNumber}`, statusCode: 404 });
      return;
    }

    sendSuccess(res, { message: "Order retrieved successfully", data: order });
  } catch (error) {
    next(error);
  }
}

export async function listEnquiriesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const type = parseEnquiryType(req.query.type);
    const status = parseEnquiryStatus(req.query.status);

    const result = await adminDashboardService.listEnquiriesForAdmin({ page, limit, type, status });
    sendSuccess(res, { message: "Enquiries retrieved successfully", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getLowStockProductsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const products = await adminDashboardService.getLowStockProducts();
    sendSuccess(res, {
      message: "Low stock products retrieved successfully",
      data: { products, count: products.length },
    });
  } catch (error) {
    next(error);
  }
}
