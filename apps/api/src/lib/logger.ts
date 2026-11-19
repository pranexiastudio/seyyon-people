import pino from "pino";
export const logger = pino({ redact: ["password", "passwordHash", "authorization", "cookie", "DATABASE_URL", "JWT_SECRET"] });

