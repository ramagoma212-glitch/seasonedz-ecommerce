// Entry point — the only file that actually starts listening. Keeping
// this separate from app.ts means the Express app itself stays easy
// to import elsewhere (tests, future serverless adapters, etc.).

import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

app.listen(env.port, () => {
  console.log(`Seasonedz API listening on port ${env.port} (${env.nodeEnv})`);
});
