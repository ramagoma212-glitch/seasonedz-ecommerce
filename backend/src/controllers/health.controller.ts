import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { sendSuccess } from "../utils/apiResponse.js";

// Kept as a small hardcoded constant (matching package.json's
// "version") rather than importing package.json — avoids relying on
// JSON-import syntax that isn't uniformly supported across the Node
// versions this backend targets (see package.json's "engines").
const SERVICE_VERSION = "0.1.0";

export function getHealth(_req: Request, res: Response): void {
  sendSuccess(res, {
    message: "Seasonedz API is running",
    data: {
      service: "seasonedz-backend",
      version: SERVICE_VERSION,
      environment: env.nodeEnv,
      timestamp: new Date().toISOString(),
    },
  });
}
