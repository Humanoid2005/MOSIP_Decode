import express from "express";
import type { ErrorRequestHandler } from "express";
import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { AppError } from "../../../services/errors.js";
import { ProtocolProxy } from "../../../services/proxy-service/ProtocolProxy.js";
import { testRun } from "../../fixtures.js";

export async function listen(handler: RequestListener) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export interface BridgeStubs {
  identify?: () => string | undefined;
  capture?: (...args: unknown[]) => void;
  bridgeBody?: (
    id: string | undefined,
    path: string,
    body: Buffer,
  ) => Promise<Buffer>;
  failures?: unknown[][];
}

// Mounts ProtocolProxy the way app.ts does, with stubbed observers.
export async function bridge(upstreamUrl: string, stubs: BridgeStubs = {}) {
  const environment = {
    ...testRun().environment,
    certifyUrl: upstreamUrl,
    verifyUrl: upstreamUrl,
    authorizationUrl: "",
  };
  const proxy = new ProtocolProxy(
    { get: () => environment } as never,
    {
      identify: stubs.identify ?? (() => undefined),
      observeSubmission: () => {},
      capture: stubs.capture ?? (() => {}),
    } as never,
    {
      bridgeBody:
        stubs.bridgeBody ??
        (async (_id: unknown, _path: unknown, body: Buffer) => body),
      fail: (...args: unknown[]) => stubs.failures?.push(args),
    } as never,
  );
  const app = express();
  app.use(
    "/bridge",
    express.raw({ type: () => true, limit: "5mb" }),
    (req, res, next) => {
      proxy.forward(req, res).catch(next);
    },
  );
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    res
      .status(error instanceof AppError ? error.status : 500)
      .json({ error: error.message });
  };
  app.use(errors);
  return listen(app);
}
