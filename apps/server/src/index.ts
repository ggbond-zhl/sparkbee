import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { loadServerConfig } from "./config/env";

const config = loadServerConfig();
const app = createApp();

serve({
  fetch: app.fetch,
  port: config.port
});

console.info(`SparkBee server listening on http://localhost:${config.port}`);
