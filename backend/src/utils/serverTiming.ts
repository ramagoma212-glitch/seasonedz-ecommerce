// Milestone 191, Part T: lightweight, non-PII timing instrumentation for
// the public catalogue endpoints only (product/category/preorder
// controllers) — added specifically to separate database/service time
// from overall request time when investigating public API latency. No
// request bodies, cookies, auth tokens or customer data are ever
// recorded — only a route label and an elapsed millisecond count,
// exposed via the standard Server-Timing response header so it's
// visible to curl/browser devtools without any server-side log storage.
import type { NextFunction, Request, Response } from "express";

function appendServerTiming(res: Response, label: string, durationMs: number): void {
  const entry = `${label};dur=${durationMs.toFixed(1)}`;
  const existing = res.get("Server-Timing");
  res.set("Server-Timing", existing ? `${existing}, ${entry}` : entry);
}

// Wraps a service/database call, timing it and recording the result on
// the Server-Timing header under the given label (conventionally "db").
export async function timed<T>(res: Response, label: string, fn: () => Promise<T>): Promise<T> {
  const start = process.hrtime.bigint();
  try {
    return await fn();
  } finally {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    appendServerTiming(res, label, durationMs);
  }
}

// Records overall controller time (request received -> res.json() called)
// under the "total" Server-Timing label, so it can be compared against the
// "db" label(s) `timed()` above records — the gap between the two is
// mapping/transformation + JSON serialization + everything else the
// controller does outside the database call itself.
export function requestTimingMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const totalMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    appendServerTiming(res, "total", totalMs);
    return originalJson(body);
  }) as typeof res.json;
  next();
}
