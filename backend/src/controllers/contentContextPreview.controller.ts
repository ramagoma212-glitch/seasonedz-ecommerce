// Content Studio Phase 3A, brief sections 31-33: lets an ADMIN or
// STAFF see exactly what buildContentContext() assembles for a given
// product/audience/pillar/platform selection — never an AI
// generation, never a raw provider prompt, never a secret. This is
// the only new route Phase 3A adds (brief section 35's own explicit
// allowlist).

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { buildContentContext, ContentContextError } from "../services/ai/contentContext.service.js";

const MAX_PLATFORMS = 3;

function parseOptionalId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parsePlatforms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string").slice(0, MAX_PLATFORMS);
}

export async function previewContentContextHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const context = await buildContentContext({
      productId: parseOptionalId(body.productId),
      audienceId: parseOptionalId(body.audienceId),
      pillarId: parseOptionalId(body.pillarId),
      purpose: "admin-context-preview",
      platforms: parsePlatforms(body.platforms),
    });
    sendSuccess(res, { message: "Context preview generated successfully", data: context });
  } catch (error) {
    if (error instanceof ContentContextError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
