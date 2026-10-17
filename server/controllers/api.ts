import { Router } from "express";
import type { RunDao, IssuerAdapter } from "../models/contracts.js";
import type { EnvironmentService } from "../services/EnvironmentService.js";
import type { RunService } from "../services/run-service/RunService.js";
import type { VerificationService } from "../services/run-service/VerificationService.js";
import type { ReportService } from "../services/run-service/ReportService.js";
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
  router.get("/issuer", async (_req, res) =>
    res.json(await deps.issuer.discover(deps.environment.get())),
  );
  router.get("/runs", (_req, res) =>
    res.json(
      deps.dao
        .all()
        .map(
          ({
            events,
            result,
            offerUri,
            presentationUri,
            credentialFingerprints,
            ...run
          }) => ({ ...run, eventCount: events.length }),
        ),
    ),
  );
  router.post("/runs", async (req, res) =>
    res.status(201).json(await deps.runs.start(req.body)),
  );
  router.get("/runs/:id", (req, res) => res.json(deps.dao.get(req.params.id)));
  router.post("/runs/:id/holder", (req, res) =>
    res.json(deps.runs.confirmHolder(req.params.id)),
  );
  router.post("/runs/:id/cancel", (req, res) =>
    res.json(deps.runs.cancel(req.params.id)),
  );
  router.post("/runs/:id/presentation", async (req, res) =>
    res.json(await deps.verification.begin(req.params.id)),
  );
  router.post("/runs/:id/refresh", async (req, res) =>
    res.json(await deps.verification.refresh(req.params.id)),
  );
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
