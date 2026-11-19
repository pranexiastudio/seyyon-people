import { app } from "./app.js";
import { env } from "./config/env.js";
import { database } from "./lib/database.js";
import { logger } from "./lib/logger.js";

const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, "Seyyon API listening"));
function shutdown() {
  const deadline = setTimeout(() => process.exit(1), 10_000);
  deadline.unref();
  server.close(() => {
    void database.$disconnect().then(() => { clearTimeout(deadline); process.exit(0); });
  });
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

