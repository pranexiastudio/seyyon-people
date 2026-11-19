import { Router, raw, type Request, type Response } from "express";
import { z } from "zod";
import { companySchema, tenantConfigSchema, tenantStatuses } from "@seyyon/shared";
import { authenticate, requirePlatformAdmin } from "../../middleware/auth.js";
import { HttpError } from "../../middleware/errors.js";
import * as tenants from "./service.js";
import { organizationRouter } from "../organization/routes.js";

export const platformRouter = Router();
export const workspaceCompanyRouter = Router();
platformRouter.use(authenticate, requirePlatformAdmin, (_request, response, next) => {
  tenants.assertPlatform(actor(response));
  next();
});
workspaceCompanyRouter.use(authenticate, (request, response, next) => {
  const expected = request.get("X-Expected-Membership");
  const { profile } = actor(response);
  // A stale tab can reject a context change but cannot select a tenant.
  if (expected && !profile.contexts.some(({ id, tenantId }) => id === expected && tenantId === profile.tenantId)) {
    throw new HttpError(409, "WORKSPACE_CHANGED", "Your company workspace changed. Reload this page before continuing.");
  }
  next();
});

const actor = (response: Response): tenants.Actor => ({
  profile: response.locals.profile, requestId: response.locals.requestId,
});
workspaceCompanyRouter.use("/organization", organizationRouter);
const companyId = (request: Request) => z.uuid().parse(request.params.companyId);
const membershipId = (request: Request) => z.uuid().parse(request.params.membershipId);
const listQuery = z.strictObject({
  search: z.string().trim().max(200).default(""),
  status: z.enum(tenantStatuses).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(15),
});

platformRouter.get("/dashboard", async (_request, response) => {
  response.json(await tenants.dashboard(actor(response)));
});
platformRouter.get("/companies", async (request, response) => {
  const { search, status, page, limit } = listQuery.parse(request.query);
  response.json(await tenants.listCompanies(actor(response), search, status, page, limit));
});
platformRouter.post("/companies", async (request, response) => {
  const company = await tenants.createCompany(actor(response), parseCompany(request.body));
  response.location("/api/v1/platform/companies/" + company.id).status(201).json(company);
});
platformRouter.patch("/companies/:companyId/status", async (request, response) => {
  const { status } = z.strictObject({ status: z.enum(tenantStatuses) }).parse(request.body);
  await tenants.setCompanyStatus(actor(response), companyId(request), status);
  response.sendStatus(204);
});
platformRouter.get("/companies/:companyId/admins", async (request, response) => {
  response.json(await tenants.listAdmins(actor(response), companyId(request)));
});
platformRouter.post("/companies/:companyId/admins", async (request, response) => {
  const { email, action } = z.strictObject({ email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
    action: z.enum(["invite", "assign"]) }).parse(request.body);
  response.status(201).json(await tenants.addAdmin(actor(response), companyId(request), email, action));
});
platformRouter.patch("/companies/:companyId/admins/:membershipId/status", async (request, response) => {
  const { status } = z.strictObject({ status: z.enum(["ACTIVE", "DISABLED"]) }).parse(request.body);
  await tenants.setAdminStatus(actor(response), companyId(request), membershipId(request), status);
  response.sendStatus(204);
});
platformRouter.post("/companies/:companyId/admins/:membershipId/password-link", async (request, response) => {
  const { invitation } = z.strictObject({ invitation: z.boolean().default(false) }).parse(request.body);
  response.status(202).json(await tenants.sendAdminReset(actor(response), companyId(request), membershipId(request), invitation));
});

function parseCompany(body: unknown) {
  const parsed = companySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    const message = field === "companyEmail" ? "Enter a valid company email."
      : field === "website" ? "Enter a website URL starting with http:// or https://."
      : field === "contactNumber" ? "Enter a valid company contact number."
      : field ? `Check the value for ${String(field).replace(/[A-Z]/g, (letter) => " " + letter.toLowerCase())}.`
      : "Check the company details and try again.";
    throw new HttpError(400, "INVALID_COMPANY", message);
  }
  return parsed.data;
}

const imageTypes = ["image/png", "image/jpeg", "image/webp"];
const rawLogo = raw({ type: imageTypes, limit: 512 * 1024 });
function isImage(type: string, bytes: Buffer) {
  if (type === "image/png") return bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) && bytes.toString("ascii", 12, 16) === "IHDR";
  if (type === "image/jpeg") return bytes.length >= 8 && bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")) && bytes.subarray(-2).equals(Buffer.from("ffd9", "hex"));
  return bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

function companyRoutes(router: Router, path: string, resolveId: (request: Request) => string | undefined) {
  router.get(path, async (request, response) => {
    response.json(await tenants.companyDetails(actor(response), resolveId(request)));
  });
  router.put(path, async (request, response) => {
    await tenants.updateCompany(actor(response), resolveId(request), parseCompany(request.body));
    response.sendStatus(204);
  });
  router.get(path + "/configuration", async (request, response) => {
    response.json(await tenants.getConfig(actor(response), resolveId(request)));
  });
  router.put(path + "/configuration", async (request, response) => {
    const config = tenantConfigSchema.safeParse(request.body);
    if (!config.success) {
      const issue = config.error.issues[0];
      throw new HttpError(400, "INVALID_CONFIGURATION", issue?.message || "Check your configuration values.");
    }
    await tenants.setConfig(actor(response), resolveId(request), config.data);
    response.sendStatus(204);
  });
  router.get(path + "/logo", async (request, response) => {
    response.set("Cache-Control", "private, no-store").json({ logo: await tenants.getLogo(actor(response), resolveId(request)) });
  });
  router.put(path + "/logo", rawLogo, async (request, response) => {
    const type = imageTypes.find((value) => request.is(value));
    if (!type || !Buffer.isBuffer(request.body) || !isImage(type, request.body)) {
      throw new HttpError(400, "INVALID_LOGO", "Upload a PNG, JPEG or WebP image.");
    }
    await tenants.updateLogo(actor(response), resolveId(request), "data:" + type + ";base64," + request.body.toString("base64"));
    response.sendStatus(204);
  });
  router.delete(path + "/logo", async (request, response) => {
    await tenants.updateLogo(actor(response), resolveId(request), null);
    response.sendStatus(204);
  });
}
companyRoutes(platformRouter, "/companies/:companyId", companyId);
companyRoutes(workspaceCompanyRouter, "/company", () => undefined);

