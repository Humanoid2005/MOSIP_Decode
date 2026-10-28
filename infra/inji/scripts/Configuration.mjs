import { readFile, stat } from "node:fs/promises";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const root = fileURLToPath(new URL("../../../", import.meta.url));
export const configHome = resolve(process.env.INJI_CONFIG_HOME || root);
export const secretsDirectory = resolve(configHome, "infra/inji/secrets");
export const environmentFile = resolve(configHome, ".env");
export const generatedDirectory = resolve(root, "infra/inji/generated");
// Present only while mobile mode publishes the stack on a phone-reachable origin.
export const mobileStateFile = resolve(generatedDirectory, "mobile.json");
export const playgroundOrigin = "http://localhost:5173";
export const definitionId = "00000000-0000-4000-8000-000000000001";
// Presentation definition per credential format; the SD-JWT definition is created by migration 005.
export const definitionIds = {
  ldp_vc: definitionId,
  "vc+sd-jwt": "00000000-0000-4000-8000-000000000002",
};

export function validateOrigin(name, value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    url.pathname !== "/" ||
    value.endsWith("/")
  )
    throw new Error(name + " must be an HTTPS origin without path or trailing slash.");
  return value;
}

export async function readMobileState() {
  const text = await readFile(mobileStateFile, "utf8").catch(() => null);
  if (text === null) return null;
  const state = JSON.parse(text);
  validateOrigin("Mobile origin", state.origin);
  return state;
}

export class Configuration {
  constructor(values, baseOrigin = values.INJI_PUBLIC_ORIGIN) {
    this.values = values;
    // The origin in .env; values derived from it move with the public origin.
    this.baseOrigin = baseOrigin;
  }

  withOrigin(origin) {
    validateOrigin("Public origin", origin);
    const current = this.origin;
    const values = { ...this.values };
    for (const [key, value] of Object.entries(values))
      if (value === current || value.startsWith(current + "/"))
        values[key] = origin + value.slice(current.length);
    return new Configuration(values, this.baseOrigin);
  }

  get mobile() {
    return this.origin !== this.baseOrigin;
  }

  static async load() {
    const values = parseEnv(await readFile(environmentFile, "utf8"));
    const required = [
      "INJI_PUBLIC_ORIGIN",
      "POSTGRES_PASSWORD",
      "CERTIFY_KEYSTORE_PASSWORD",
      "MIMOTO_KEYSTORE_PASSWORD",
      "VERIFY_KEYSTORE_PASSWORD",
      "MINIO_ROOT_USER",
      "MINIO_ROOT_PASSWORD",
      "AUTHORIZATION_ORIGIN",
      "AUTHORIZATION_ISSUER_URL",
      "AUTHORIZATION_JWKS_URL",
      "AUTHORIZATION_TOKEN_URL",
      "AUTHORIZATION_CREDENTIAL_AUDIENCE",
      "WALLET_CLIENT_ID",
      "WALLET_CLIENT_ALIAS",
      "WALLET_REDIRECT_URI",
      "GOOGLE_OAUTH_CLIENT_ID",
      "GOOGLE_OAUTH_CLIENT_SECRET",
    ];
    const missing = required.filter((key) => !values[key]?.trim());
    if (missing.length)
      throw new Error("Set these root .env values: " + missing.join(", "));
    for (const [key, value] of Object.entries(values)) {
      if (/[\r\n]/.test(value))
        throw new Error(key + " must be a single line.");
    }
    for (const key of required.filter((key) =>
      /ORIGIN$|_URL$|_AUDIENCE$/.test(key),
    )) {
      const url = new URL(values[key]);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.hash ||
        url.search
      ) {
        throw new Error(
          key +
            " must be an HTTP(S) URL without credentials, query or fragment.",
        );
      }
      if (key.endsWith("ORIGIN") && url.pathname !== "/")
        throw new Error(key + " must have no path.");
      if (key.endsWith("ORIGIN") && values[key].endsWith("/"))
        throw new Error(key + " must have no trailing slash.");
    }
    if (!values.INJI_PUBLIC_ORIGIN.startsWith("https://")) {
      throw new Error(
        "INJI_PUBLIC_ORIGIN must be HTTPS for wallet access and did:web resolution.",
      );
    }
    const port = Number(values.INJI_GATEWAY_PORT || 8091);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("Invalid INJI_GATEWAY_PORT.");
    if (![8000, 5173].every((reserved) => port !== reserved))
      throw new Error("Gateway port conflicts with the playground.");
    for (const file of ["oidckeystore.p12", "verify-keystore.p12"]) {
      const info = await stat(resolve(secretsDirectory, file)).catch(
        () => null,
      );
      if (!info?.isFile() || !info.size)
        throw new Error("Provide infra/inji/secrets/" + file);
    }
    const configuration = new Configuration(values);
    const mobile = await readMobileState();
    return mobile ? configuration.withOrigin(mobile.origin) : configuration;
  }

  get origin() {
    return this.values.INJI_PUBLIC_ORIGIN;
  }
  get issuerDid() {
    return "did:web:" + new URL(this.origin).host.replaceAll(":", "%3A");
  }
  get verifierDid() {
    return this.issuerDid + ":v1:verify";
  }
  get localOrigin() {
    return "http://127.0.0.1:" + (this.values.INJI_GATEWAY_PORT || "8091");
  }
}

export function properties(source, replacements) {
  const lines = source.split(/\r?\n/);
  const retained = [];
  for (let i = 0; i < lines.length; i++) {
    const key = lines[i].match(/^([^#!\s][^=]*?)\s*=/)?.[1];
    if (key && Object.hasOwn(replacements, key)) {
      while (lines[i]?.endsWith("\\")) i++;
    } else retained.push(lines[i]);
  }
  const escape = (value) => String(value).replaceAll("\\", "\\\\");
  return (
    retained.join("\n") +
    "\n" +
    Object.entries(replacements)
      .map(([key, value]) => key + "=" + escape(value))
      .join("\n") +
    "\n"
  );
}
