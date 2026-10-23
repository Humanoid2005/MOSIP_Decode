import { Router } from "express";
import type { MockWalletService } from "../services/mock-wallet/MockWalletService.js";
import { AppError } from "../services/errors.js";
const escape = (value: string) =>
  value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
const page = (title: string, message: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#0f172a}p{color:#475569;line-height:1.6}</style></head><body><h1>${escape(title)}</h1><p>${escape(message)}</p></body></html>`;
export function mockWalletRoutes(wallet: MockWalletService) {
  const router = Router();
  router.post("/runs/:id/mock-wallet/authorize", async (req, res) =>
    res.json(await wallet.authorize(req.params.id)),
  );
  router.post("/runs/:id/mock-wallet/present", async (req, res) =>
    res.json(await wallet.present(req.params.id)),
  );
  router.get("/mock-wallet/callback", async (req, res) => {
    const { code, state, error, error_description: description } = req.query;
    try {
      if (typeof error === "string")
        throw new AppError(
          400,
          `Authorization failed: ${typeof description === "string" ? description : error}.`,
        );
      if (typeof code !== "string" || typeof state !== "string")
        throw new AppError(
          400,
          "The authorization response is missing its code or state.",
        );
      await wallet.complete(state, code);
      res
        .type("html")
        .send(
          page(
            "Credential received",
            "The playground mock wallet stored the credential. Close this tab and return to the workbench.",
          ),
        );
    } catch (failure) {
      res
        .status(failure instanceof AppError ? failure.status : 500)
        .type("html")
        .send(
          page(
            "Issuance failed",
            failure instanceof AppError
              ? failure.message
              : "Unexpected server error.",
          ),
        );
    }
  });
  return router;
}
