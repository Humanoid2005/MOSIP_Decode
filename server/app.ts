import express from "express";
import type { ErrorRequestHandler } from "express";
import cors from "cors";
import { createServer } from "node:http";
import { settings, initialEnvironment } from "./config/environment.js";
import { InMemoryRunDao } from "./models/InMemoryRunDao.js";
import { EnvironmentService } from "./services/EnvironmentService.js";
import { HttpClient } from "./services/HttpClient.js";
import { TelemetryService } from "./services/telemetry/TelemetryService.js";
import { ObservedHttpClient } from "./services/telemetry/ObservedHttpClient.js";
import { TelemetrySocket } from "./services/telemetry/TelemetrySocket.js";
import { InjiIssuerAdapter } from "./services/inji/InjiIssuerAdapter.js";
import { InjiVerifierAdapter } from "./services/inji/InjiVerifierAdapter.js";
import { OfferService } from "./services/run-service/OfferService.js";
import { RunService } from "./services/run-service/RunService.js";
import { VerificationCoordinator } from "./services/run-service/VerificationCoordinator.js";
import { VerificationService } from "./services/run-service/VerificationService.js";
import { ReportService } from "./services/run-service/ReportService.js";
import { ProxyCaptureService } from "./services/proxy-service/ProxyCaptureService.js";
import { ProtocolProxy } from "./services/proxy-service/ProtocolProxy.js";
import { AppError } from "./services/errors.js";
import { apiRoutes } from "./controllers/api.js";
import { mockWalletRoutes } from "./controllers/mockWallet.js";
import { InMemoryWalletSessionDao } from "./models/InMemoryWalletSessionDao.js";
import { MockWalletService } from "./services/mock-wallet/MockWalletService.js";
import { InMemoryMimotoSessionDao } from "./models/InMemoryMimotoSessionDao.js";
import { MimotoClient } from "./services/mimoto-wallet/MimotoClient.js";
import { MimotoIssuanceService } from "./services/mimoto-wallet/MimotoIssuanceService.js";
import { MimotoPresentationService } from "./services/mimoto-wallet/MimotoPresentationService.js";
import { MimotoWalletService } from "./services/mimoto-wallet/MimotoWalletService.js";
import { mimotoWalletRoutes } from "./controllers/mimotoWallet.js";

import { ScenarioService } from "./services/scenario-service/ScenarioService.js";

export function createApplication() {
  const dao = new InMemoryRunDao();
  const environment = new EnvironmentService(initialEnvironment);
  const http = new HttpClient();
  const telemetry = new TelemetryService(dao);
  const observedHttp = new ObservedHttpClient(http, telemetry);
  const scenarios = new ScenarioService(dao, telemetry, observedHttp);
  const issuer = new InjiIssuerAdapter(observedHttp);
  const runs = new RunService(
    dao,
    environment,
    issuer,
    telemetry,
    new OfferService(observedHttp),
  );
  const verification = new VerificationService(
    dao,
    new InjiVerifierAdapter(observedHttp, scenarios),
    telemetry,
    scenarios,
  );
  const wallet = new MockWalletService(
    dao,
    new InMemoryWalletSessionDao(),
    http,
    runs,
    telemetry,
    settings.mockWalletClientId,
    `${settings.clientOrigin}/api/v1/mock-wallet/callback`,
    scenarios,
  );
  const mimoto = new MimotoClient(http, telemetry);
  const embeddedWallet = new MimotoWalletService(
    runs,
    dao,
    new InMemoryMimotoSessionDao(),
    mimoto,
    new MimotoIssuanceService(mimoto),
    new MimotoPresentationService(mimoto, scenarios),
    scenarios,
  );
  const embeddedOrigin = initialEnvironment.embeddedWalletUrl
    ? new URL(initialEnvironment.embeddedWalletUrl).origin
    : "";
  const proxy = new ProtocolProxy(
    environment,
    new ProxyCaptureService(dao, runs, telemetry),
    scenarios,
  );
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/bridge",
    express.raw({ type: () => true, limit: "5mb" }),
    (req, res, next) => {
      proxy.forward(req, res).catch(next);
    },
  );
  const origins = [
    settings.clientOrigin,
    ...(embeddedOrigin ? [embeddedOrigin] : []),
    `http://localhost:${settings.port}`,
    `http://127.0.0.1:${settings.port}`,
  ];
  const clientOrigin = new URL(settings.clientOrigin);
  if (["localhost", "127.0.0.1"].includes(clientOrigin.hostname)) {
    clientOrigin.hostname =
      clientOrigin.hostname === "localhost" ? "127.0.0.1" : "localhost";
    origins.push(clientOrigin.origin);
  }
  app.use("/api", (req, _res, next) => {
    if (req.headers.origin && !origins.includes(req.headers.origin))
      return next(new AppError(403, "Origin not allowed."));
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !req.is("application/json")
    )
      return next(new AppError(415, "Use application/json for API requests."));
    next();
  });
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: "256kb" }));
  app.use(
    "/api/v1",
    apiRoutes({
      dao,
      issuer,
      environment,
      runs,
      verification,
      reports: new ReportService(dao),
    }),
  );
  app.use("/api/v1", mockWalletRoutes(wallet));
  app.use(
    "/v1/mimoto/playground",
    mimotoWalletRoutes(embeddedWallet, embeddedOrigin),
  );
  app.use((_req, _res, next) => next(new AppError(404, "Endpoint not found.")));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const status =
      error instanceof AppError
        ? error.status
        : error.type === "entity.too.large"
          ? 413
          : error instanceof SyntaxError
            ? 400
            : 500;
    res.status(status).json({
      error: status === 500 ? "Unexpected server error." : error.message,
    });
  };
  app.use(errors);
  const server = createServer(app);
  new VerificationCoordinator(dao, verification).attach(server);
  const closeSockets = new TelemetrySocket().attach(server, telemetry, origins);
  const shutdown = () => {
    closeSockets();
    server.closeAllConnections();
  };
  return { app, server, shutdown };
}
