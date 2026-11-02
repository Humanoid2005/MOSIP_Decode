import { Router } from "express";
import type { RunDao, IssuerAdapter } from "../models/contracts.js";
import type { EnvironmentService } from "../services/EnvironmentService.js";
import type { RunService } from "../services/run-service/RunService.js";
import type { VerificationService } from "../services/run-service/VerificationService.js";
import type { ReportService } from "../services/run-service/ReportService.js";
// Playground REST API under /api/v1: health, configuration, issuer discovery,
// the run lifecycle and report download. Handlers only translate HTTP to
// service calls; app.ts applies the origin and JSON content-type guards.
export function apiRoutes(deps: {
  dao: RunDao;
  issuer: IssuerAdapter;
  environment: EnvironmentService;
  runs: RunService;
  verification: VerificationService;
  reports: ReportService;
}) {
  const router = Router();
  router.get("/health", (_req, res) =>
    res.json({ status: "UP", storage: "memory", maxRuns: 100 }),
  );
  router.get("/environment", (_req, res) => res.json(deps.environment.get()));
  // Live discovery from Certify. It is not tied to a run, so nothing is
  // recorded.
  router.get("/issuer", async (_req, res) =>
    res.json(await deps.issuer.discover(deps.environment.get())),
  );
  // Run summaries, newest first, without event logs.
  router.get("/runs", (_req, res) => res.json(deps.dao.summaries()));
  // Starts a run. Only one run can be active at a time.
  router.post("/runs", async (req, res) =>
    res.status(201).json(await deps.runs.start(req.body)),
  );
  router.get("/runs/:id", (req, res) => res.json(deps.dao.get(req.params.id)));
  // Manual receipt confirmation for wallets that cannot report it themselves
  // (Inji Mobile, Inji Web). The embedded and mock wallets confirm their own.
  router.post("/runs/:id/holder", (req, res) =>
    res.json(deps.runs.confirmHolder(req.params.id)),
  );
  // Stops the local run only; the upstream offer or request is not revoked.
  router.post("/runs/:id/cancel", (req, res) =>
    res.json(deps.runs.cancel(req.params.id)),
  );
  // Creates the Inji Verify request for a held credential. For mDoc it sends
  // the observed credential to Verify's direct check instead (gap V4).
  router.post("/runs/:id/presentation", async (req, res) =>
    res.json(await deps.verification.begin(req.params.id)),
  );
  // Manual result check; VerificationCoordinator already polls in the
  // background.
  router.post("/runs/:id/refresh", async (req, res) =>
    res.json(await deps.verification.refresh(req.params.id)),
  );
  // Downloads the redacted JSON report as a file.
  router.get("/runs/:id/report", (req, res) => {
    const report = deps.reports.generate(req.params.id);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="inji-run-${req.params.id}.json"`,
    );
    res.json(report);
  });
  return router;
}
