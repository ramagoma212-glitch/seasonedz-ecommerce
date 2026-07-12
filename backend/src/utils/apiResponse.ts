// Keeps every API response in the same shape, so frontend code (once
// it's connected in a later milestone) can rely on one consistent
// envelope instead of guessing per-endpoint.
//
// Success: { success: true,  message, data }
// Error:   { success: false, message, errors }

import type { Response } from "express";

interface SuccessOptions<T> {
  message: string;
  data?: T;
  statusCode?: number;
}

interface ErrorOptions {
  message: string;
  errors?: unknown;
  statusCode?: number;
}

export function sendSuccess<T>(res: Response, { message, data, statusCode = 200 }: SuccessOptions<T>): Response {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

export function sendError(res: Response, { message, errors, statusCode = 500 }: ErrorOptions): Response {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
}
