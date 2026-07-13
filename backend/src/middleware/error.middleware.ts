// Central error handler — must be registered last, after every route
// and after notFoundMiddleware. Express only recognises a middleware
// as an error handler if it declares all four parameters (err, req,
// res, next), even though next is unused here.

import type { NextFunction, Request, Response } from "express";
import { isProduction } from "../config/env.js";
import { sendError } from "../utils/apiResponse.js";

// express.json() throws this shape when the request body isn't valid
// JSON (body-parser sets .status = 400 and .type = "entity.parse.failed").
// That's a client mistake, not a server bug, so it deserves a 400 with
// a clear message rather than falling through to the generic 500 below.
function isJsonParseError(err: unknown): err is SyntaxError & { status?: number; type?: string } {
  return err instanceof SyntaxError && (err as { type?: string }).type === "entity.parse.failed";
}

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (!isProduction) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  }

  if (isJsonParseError(err)) {
    sendError(res, { message: "Request body must be valid JSON.", statusCode: 400 });
    return;
  }

  const message = err instanceof Error ? err.message : "Unexpected server error";

  sendError(res, {
    // Don't leak internal error details to clients in production.
    message: isProduction ? "Something went wrong. Please try again later." : message,
    statusCode: 500,
  });
}
