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

// Composition root. Builds each service once, injects dependencies through
// constructors and mounts the HTTP surface. Returns the Express app, the HTTP
// server with the event socket and result poller attached, and a shutdown
// hook that closes sockets and open connections.
export function createApplication() {
  // Shared services. Orchestrator calls to the Inji services go through
  // ObservedHttpClient, which records them on the run; the wallets use the
  // plain client and record their own events.
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
  // The mock wallet's redirect URI is on the workbench origin, whose /api path
  // is proxied to this server.
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
  // The embedded wallet API accepts requests from this origin only.
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
  // Run state changes continuously, so no response may be cached.
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  // Protocol bridge. Mounted before the CORS and JSON middleware, so the
  // proxy receives the exact bytes the wallet sent.
  app.use(
    "/bridge",
    express.raw({ type: () => true, limit: "5mb" }),
    (req, res, next) => {
      proxy.forward(req, res).catch(next);
    },
  );
  // Origins allowed to call the API and open the event socket: the workbench,
  // the embedded wallet page and this server. A loopback workbench origin is
  // also allowed under its other name, because browsers treat localhost and
  // 127.0.0.1 as different origins.
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
  // API guard: a request with an Origin header must come from an allowed
  // origin, and state-changing requests must be JSON, which an HTML form on
  // another site cannot send.
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
  // CORS for the allowed origins, and a 256 KB limit on JSON bodies.
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: "256kb" }));
  // Playground and mock wallet APIs.
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
  // Embedded wallet API, under Mimoto's cookie path. The gateway routes this
  // prefix to the playground server.
  app.use(
    "/v1/mimoto/playground",
    mimotoWalletRoutes(embeddedWallet, embeddedOrigin),
  );
  app.use((_req, _res, next) => next(new AppError(404, "Endpoint not found.")));
  // Every error becomes {"error": message}. AppError and HTTP errors marked as
  // exposable keep their status, malformed JSON is 400, and anything else is
  // logged and returned as a generic 500 so internals do not leak.
  const errors: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error instanceof AppError
        ? error.status
        : error.expose && Number.isInteger(error.status)
          ? error.status
          : error instanceof SyntaxError
            ? 400
            : 500;
    if (status === 500) console.error(error);
    res.status(status).json({
      error: status === 500 ? "Unexpected server error." : error.message,
    });
  };
  app.use(errors);
  // VerificationCoordinator polls Inji Verify for the active run once the
  // server is listening. TelemetrySocket serves /api/v1/events to the allowed
  // origins and pushes a notice whenever a run changes.
  const server = createServer(app);
  new VerificationCoordinator(dao, verification).attach(server);
  const closeSockets = new TelemetrySocket().attach(server, telemetry, origins);
  const shutdown = () => {
    closeSockets();
    server.closeAllConnections();
  };
  return { app, server, shutdown };
}
