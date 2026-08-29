// Content Studio Phase 2: the first role-gated admin route this
// backend has ever needed. Every existing admin route only ever checks
// "is this a valid admin session" (requireAdminAuth) — none has
// distinguished ADMIN from STAFF before now (see AdminUser's role
// field, UserRole enum). Brand Knowledge write actions are ADMIN-only
// (brief section 22); STAFF keeps read access via requireAdminAuth
// alone, applied first at the router level exactly as every other
// admin router already does.
//
// Deliberately backend-only enforcement — nothing about a request's
// role can be trusted from the frontend (brief section 22's own "no
// role escalation through frontend manipulation" rule); this reads
// req.adminUser.role, set exclusively by requireAdminAuth from the
// signed session cookie, never from request input.

import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { sendError } from "../utils/apiResponse.js";

export function requireAdminRole(role: UserRole) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (!req.adminUser) {
      // Only reachable if this middleware is ever mounted before
      // requireAdminAuth — a wiring mistake, not a real request state.
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }

    if (req.adminUser.role !== role) {
      sendError(res, { message: "You do not have permission to perform this action.", statusCode: 403 });
      return;
    }

    next();
  };
}
