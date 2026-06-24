import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { loadServerConfig } from "./config/env";
import { createDatabase } from "./db";
import { createServices } from "./services";

const config = loadServerConfig();
const db = createDatabase(config.databaseUrl);
const services = createServices(config, db);
const app = createApp(services);

await services.stations.restoreRunningStations();

serve({
  fetch: app.fetch,
  port: config.port
});

console.info(`SparkBee server listening on http://localhost:${config.port}`);
