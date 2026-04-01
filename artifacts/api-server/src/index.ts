import app from "./app";
import { logger } from "./lib/logger";
import { startSyncScheduler, runSync } from "./lib/syncJob";
import { loadCredentialsFromDb } from "./lib/credentialsLoader";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  loadCredentialsFromDb().then(() => {
    startSyncScheduler().then(() => {
      runSync().catch((err) => {
        logger.error({ err }, "Initial sync error");
      });
    });
  });
});
