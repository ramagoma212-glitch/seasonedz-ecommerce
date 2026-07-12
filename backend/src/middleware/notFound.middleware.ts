// Registered last, after every route — anything that reaches this
// point didn't match a real route, so it gets one clean JSON 404
// instead of Express's default HTML error page.

import type { Request, Response } from "express";
import { sendError } from "../utils/apiResponse.js";

export function notFoundMiddleware(req: Request, res: Response): void {
  sendError(res, {
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    statusCode: 404,
  });
}
