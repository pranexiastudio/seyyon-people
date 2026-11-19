import { Router } from "express";
import { database } from "../../lib/database.js";

export const healthRouter = Router();
healthRouter.get("/live", (_request, response) => {
  response.json({ status: "ok", service: "seyyon-api" });
});
healthRouter.get("/ready", async (_request, response) => {
  try {
    await database.$queryRaw`SELECT 1`;
    response.json({ status: "ok", service: "seyyon-api" });
  } catch {
    response.status(503).json({ status: "unavailable", service: "seyyon-api" });
  }
});

