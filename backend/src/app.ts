// Configures the Express app (middleware + routes) without starting a
// server — kept separate from server.ts so the app can be imported and
// tested (e.g. with supertest) without binding a real port.

import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { allowedOrigins } from "./config/env.js";
import routes from "./routes/index.js";
import { notFoundMiddleware } from "./middleware/notFound.middleware.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { generalRateLimiter } from "./middleware/rateLimit.middleware.js";

export function createApp(): Express {
  const app = express();

  app.use(helmet());

  // Only explicitly configured origins are allowed — never a blanket
  // "allow everything", in production or otherwise. allowedOrigins is
  // built from FRONTEND_URL (always set) and the optional
  // FRONTEND_PRODUCTION_URL (e.g. the deployed GitHub Pages site) — see
  // config/env.ts and README.md.
  app.use(
    cors({
      origin(requestOrigin, callback) {
        // Non-browser requests (curl, server-to-server, health checks)
        // don't send an Origin header at all — always allow those.
        // CORS only ever restricts what a *browser* running on some
        // other origin's page is allowed to read.
        if (!requestOrigin || allowedOrigins.includes(requestOrigin)) {
          callback(null, true);
          return;
        }
        // Not an error — just no CORS header on the response, so the
        // browser blocks the disallowed page from reading it.
        callback(null, false);
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: "1mb" }));
  // extended: false (the querystring parser, not qs) — every JSON API
  // route on this backend already reads JSON bodies, not urlencoded
  // ones, so this only matters for PayFast's ITN notification (Version
  // 3, Milestone 22), which POSTs a flat form-urlencoded body. Flat
  // key/value pairs is exactly what PayFast sends and exactly what its
  // signature verification needs — qs's nested-object parsing
  // (extended: true) is never appropriate for it.
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  // General backstop for the whole API; POST /api/orders additionally
  // has its own tighter limit — see routes/order.routes.ts.
  app.use("/api", generalRateLimiter, routes);

  // Order matters: notFound catches anything routes didn't handle,
  // errorMiddleware catches anything that throws. Both must come last.
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
