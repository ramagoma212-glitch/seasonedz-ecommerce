import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { sendSuccess } from "../utils/apiResponse.js";

export function getHealth(_req: Request, res: Response): void {
  sendSuccess(res, {
    message: "Seasonedz API is running",
    data: {
      environment: env.nodeEnv,
      timestamp: new Date().toISOString(),
    },
  });
}
