import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { env } from "./config/env.js";
import { healthRouter } from "./modules/health/routes.js";
import { errorHandler, HttpError } from "./middleware/errors.js";
import { authRouter } from "./modules/auth/routes.js";

import { platformRouter, workspaceCompanyRouter } from "./modules/tenants/routes.js";

export const app = express();
app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.locals.requestId = randomUUID();
  response.setHeader("X-Request-ID", response.locals.requestId);
  next();
});
app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(rateLimit({
  windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false,
  handler: (_request, _response, next) => next(new HttpError(429, "RATE_LIMITED", "Too many requests.")),
}));
app.use(express.json({ limit: "100kb" }));
app.use("/api/v1/health", healthRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/platform", platformRouter);
app.use("/api/v1/workspace", workspaceCompanyRouter);
app.use((_request, _response, next) => next(new HttpError(404, "NOT_FOUND", "Endpoint not found.")));
app.use(errorHandler);

