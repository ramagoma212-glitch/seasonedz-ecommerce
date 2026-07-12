// Configures the Express app (middleware + routes) without starting a
// server — kept separate from server.ts so the app can be imported and
// tested (e.g. with supertest) without binding a real port.

import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import routes from "./routes/index.js";
import { notFoundMiddleware } from "./middleware/notFound.middleware.js";
import { errorMiddleware } from "./middleware/error.middleware.js";

export function createApp(): Express {
  const app = express();

  app.use(helmet());

  // Only the configured frontend origin is allowed — never a blanket
  // "allow everything" in production. FRONTEND_URL defaults to the
  // Vite dev server locally; set it to the real deployed origin in
  // production.
  app.use(
    cors({
      origin: env.frontendUrl,
      credentials: true,
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  app.use("/api", routes);

  // Order matters: notFound catches anything routes didn't handle,
  // errorMiddleware catches anything that throws. Both must come last.
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
