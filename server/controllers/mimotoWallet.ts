import { Router } from "express";
import type { Request, Response } from "express";
import type { MimotoContext } from "../models/MimotoSession.js";
import type { MimotoWalletService } from "../services/mimoto-wallet/MimotoWalletService.js";
import { AppError, object, requiredString } from "../services/errors.js";
// Embedded wallet API. It is mounted under /v1/mimoto/playground, inside
// Mimoto's cookie path, so the browser sends its Mimoto session cookie; each
// action is carried out against Mimoto with that cookie and XSRF token.
export function mimotoWalletRoutes(
  wallet: MimotoWalletService,
  origin: string,
) {
  const router = Router();
  // Every route requires the embedded wallet page's exact origin, a JSON
  // content type and an XSRF token, so another site cannot act with the
  // user's Mimoto session. Without a configured embedded wallet origin all
  // requests are refused.
  router.use((req, _res, next) => {
    if (!origin || req.headers.origin !== origin)
      return next(
        new AppError(403, "Use the secure Inji workbench for wallet actions."),
      );
    if (!req.is("application/json"))
      return next(new AppError(415, "Use application/json."));
    if (!req.headers["x-xsrf-token"])
      return next(
        new AppError(403, "Refresh the wallet session before continuing."),
      );
    req.body = object(req.body ?? {});
    next();
  });
  // The caller's Mimoto credentials, with a sink that relays refreshed Mimoto
  // cookies to the browser on this response.
  const context = (req: Request, res: Response): MimotoContext => ({
    cookie: req.headers.cookie ?? "",
    csrfToken: String(req.headers["x-xsrf-token"] ?? ""),
    setCookies: (cookies) => {
      for (const cookie of cookies) res.append("Set-Cookie", cookie);
    },
  });
  // Issuance (authorize, complete) and presentation (prepare, submit) steps;
  // see MimotoWalletService.
  router.post("/runs/:id/authorize", async (req, res) =>
    res.json(
      await wallet.authorize(
        req.params.id,
        requiredString(req.body.walletId, "walletId"),
        context(req, res),
      ),
    ),
  );
  router.post("/runs/:id/complete", async (req, res) =>
    res.json(
      await wallet.complete(
        req.params.id,
        requiredString(req.body.state, "state"),
        requiredString(req.body.code, "code"),
        context(req, res),
      ),
    ),
  );
  router.post("/runs/:id/prepare", async (req, res) =>
    res.json(await wallet.prepare(req.params.id, context(req, res))),
  );
  router.post("/runs/:id/submit", async (req, res) =>
    res.json(await wallet.submit(req.params.id, context(req, res))),
  );
  return router;
}
