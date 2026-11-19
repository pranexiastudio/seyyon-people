import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger.js";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  const requestId = String(response.locals.requestId);
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message, requestId } });
    return;
  }
  if (error instanceof Error && "type" in error && error.type === "entity.too.large") {
    response.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "The upload exceeds the size limit.", requestId } });
    return;
  }
  if (error instanceof ZodError || (error instanceof SyntaxError && "body" in error)) {
    response.status(400).json({ error: { code: "INVALID_REQUEST", message: "Invalid request.", requestId } });
    return;
  }
  logger.error({ requestId, errorType: error instanceof Error ? error.name : "Unknown" }, "Request failed");
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred.", requestId } });
};

