import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "node:path";
const dockerEnvironment = config({
    path: resolve("..", "infra/inji/generated/playground.env"),
    quiet: true,
    processEnv: {},
}).parsed ?? {};
const endpoint = (name) => process.env[name]?.trim() || dockerEnvironment[name] || "";
export const settings = {
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT || 8000),
    clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
};
export const initialEnvironment = {
    certifyUrl: endpoint("INJI_CERTIFY_URL"),
    issuerUrl: endpoint("INJI_ISSUER_URL"),
    verifyUrl: endpoint("INJI_VERIFY_URL"),
    mimotoUrl: endpoint("INJI_MIMOTO_URL"),
    webWalletUrl: endpoint("INJI_WEB_URL"),
    authorizationUrl: endpoint("INJI_AUTHORIZATION_URL"),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${settings.port}`,
    verifierClientId: endpoint("INJI_VERIFIER_CLIENT_ID"),
    presentationDefinitionId: endpoint("INJI_PRESENTATION_DEFINITION_ID"),
    stackVersion: endpoint("INJI_STACK_VERSION"),
};
