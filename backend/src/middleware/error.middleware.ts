// Central error handler — must be registered last, after every route
// and after notFoundMiddleware. Express only recognises a middleware
// as an error handler if it declares all four parameters (err, req,
// res, next), even though next is unused here.

import type { NextFunction, Request, Response } from "express";
import { isProduction } from "../config/env.js";
import { sendError } from "../utils/apiResponse.js";

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const message = err instanceof Error ? err.message : "Unexpected server error";

  if (!isProduction) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  }

  sendError(res, {
    // Don't leak internal error details to clients in production.
    message: isProduction ? "Something went wrong. Please try again later." : message,
    statusCode: 500,
  });
}
