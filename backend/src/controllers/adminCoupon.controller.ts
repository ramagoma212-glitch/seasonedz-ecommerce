// Milestone 197: admin coupon management endpoints — same thin-handler
// shape as adminAffiliateProduct.controller.ts, all business logic lives
// in coupon.service.ts. Every route this file exports is mounted behind
// requireAdminAuth (see routes/adminCoupon.routes.ts) — a normal customer
// can never reach any of these, not merely because the admin nav hides
// the link.

import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import * as couponService from "../services/coupon.service.js";
import { CouponError } from "../services/coupon.service.js";

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function handleServiceError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof CouponError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return;
  }
  if (isPrismaUniqueConstraintError(error)) {
    sendError(res, { message: "A coupon with this code already exists.", statusCode: 409 });
    return;
  }
  next(error);
}

export async function listAdminCouponsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const coupons = await couponService.listCouponsForAdmin();
    sendSuccess(res, { message: "Coupons retrieved successfully", data: coupons });
  } catch (error) {
    next(error);
  }
}

export async function getAdminCouponHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Coupon id is required", statusCode: 400 });
      return;
    }
    const coupon = await couponService.getCouponForAdmin(id);
    if (!coupon) {
      sendError(res, { message: `Coupon not found: ${id}`, statusCode: 404 });
      return;
    }
    sendSuccess(res, { message: "Coupon retrieved successfully", data: coupon });
  } catch (error) {
    next(error);
  }
}

export async function createAdminCouponHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const coupon = await couponService.createCoupon(req.body ?? {});
    sendSuccess(res, { message: "Coupon created successfully", statusCode: 201, data: coupon });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function updateAdminCouponHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Coupon id is required", statusCode: 400 });
      return;
    }
    const coupon = await couponService.updateCoupon(id, req.body ?? {});
    sendSuccess(res, { message: "Coupon updated successfully", data: coupon });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function activateAdminCouponHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Coupon id is required", statusCode: 400 });
      return;
    }
    const coupon = await couponService.setCouponActive(id, true);
    sendSuccess(res, { message: "Coupon activated successfully", data: coupon });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function deactivateAdminCouponHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Coupon id is required", statusCode: 400 });
      return;
    }
    const coupon = await couponService.setCouponActive(id, false);
    sendSuccess(res, { message: "Coupon deactivated successfully", data: coupon });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function deleteAdminCouponHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Coupon id is required", statusCode: 400 });
      return;
    }
    await couponService.deleteCoupon(id);
    sendSuccess(res, { message: "Coupon deleted successfully", data: null });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}
