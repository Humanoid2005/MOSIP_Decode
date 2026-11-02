import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "node:path";
import type { Environment } from "../models/dtos.js";
// Startup configuration. Inji endpoints come from the process environment
// first, then from the playground.env that prepare.mjs renders. That path is
// resolved from the parent of the working directory, which is the repository
// root when the server is started from server/.
const dockerEnvironment =
  config({
    path: resolve("..", "infra/inji/generated/playground.env"),
    quiet: true,
    processEnv: {},
  }).parsed ?? {};
const endpoint = (name: string) =>
  process.env[name]?.trim() || dockerEnvironment[name] || "";
// Parses INJI_PRESENTATION_DEFINITION_IDS ("ldp_vc=<id>,vc+sd-jwt=<id>") into
// a format-to-ID map, skipping malformed entries.
function definitionIds(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of value.split(",")) {
    const separator = entry.indexOf("=");
    const format = entry.slice(0, separator).trim();
    const id = entry.slice(separator + 1).trim();
    if (separator > 0 && format && id) result[format] = id;
  }
  return result;
}
// clientOrigin is the workbench origin. The API's origin check allows it, and
// the mock wallet's callback URL is built on it.
export const settings = {
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 8000),
  clientOrigin: new URL(process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .origin,
  mockWalletClientId:
    process.env.MOCK_WALLET_CLIENT_ID || "playground-mock-wallet",
};
// The Inji environment, validated by EnvironmentService at startup.
export const initialEnvironment: Environment = {
  certifyUrl: endpoint("INJI_CERTIFY_URL"),
  issuerUrl: endpoint("INJI_ISSUER_URL"),
  verifyUrl: endpoint("INJI_VERIFY_URL"),
  mimotoUrl: endpoint("INJI_MIMOTO_URL"),
  webWalletUrl: endpoint("INJI_WEB_URL"),
  embeddedWalletUrl: endpoint("INJI_EMBEDDED_WALLET_URL"),
  authorizationUrl: endpoint("INJI_AUTHORIZATION_URL"),
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL || `http://localhost:${settings.port}`,
  verifierClientId: endpoint("INJI_VERIFIER_CLIENT_ID"),
  presentationDefinitionIds: definitionIds(
    endpoint("INJI_PRESENTATION_DEFINITION_IDS"),
  ),
  stackVersion: endpoint("INJI_STACK_VERSION"),
};
