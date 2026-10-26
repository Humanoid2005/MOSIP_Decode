import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Configuration, root } from "../Configuration.mjs";

const container =
  process.env.INJI_KEYCLOAK_CONTAINER || "inji-playground-keycloak-1";
const database =
  process.env.INJI_DATABASE_CONTAINER || "inji-playground-database-1";
const command = (...args) =>
  execFileSync("docker", ["exec", container, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
const admin = (...args) =>
  command("/opt/keycloak/bin/kcadm.sh", ...args, "-r", "inji");
try {
  const configuration = await Configuration.load();
  if (configuration.values.INJI_LOCAL_DEVELOPMENT !== "true")
    throw new Error(
      "Expiry fixtures are restricted to the local development stack.",
    );
  const sql =
    (await readFile(
      resolve(root, "infra/inji/migrations/007-expired-credential.sql"),
      "utf8",
    )) +
    "\n" +
    (await readFile(
      resolve(root, "infra/inji/migrations/008-unsupported-did-credential.sql"),
      "utf8",
    ));
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      database,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "inji_certify",
    ],
    { input: sql, stdio: ["pipe", "pipe", "pipe"] },
  );
  command(
    "sh",
    "-c",
    '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080/auth --realm master --user admin --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"',
  );
  const scopes = JSON.parse(admin("get", "client-scopes"));
  for (const name of [
    "mock_identity_vc_expired",
    "mock_identity_vc_unsupported_did",
  ]) {
    let scope = scopes.find((item) => item.name === name);
    if (!scope) {
      const source = scopes.find(
        (item) => item.name === "mock_identity_vc_ldp",
      );
      if (!source) throw new Error("The normal JSON-LD scope is missing.");
      const mappers = (source.protocolMappers ?? []).map(
        ({ id, ...mapper }) => mapper,
      );
      admin(
        "create",
        "client-scopes",
        "-s",
        `name=${name}`,
        "-s",
        "protocol=openid-connect",
        "-s",
        `attributes=${JSON.stringify(source.attributes)}`,
        "-s",
        `protocolMappers=${JSON.stringify(mappers)}`,
      );
      scope = JSON.parse(admin("get", "client-scopes")).find(
        (item) => item.name === name,
      );
    }
    for (const clientId of ["inji-wallet", "playground-mock-wallet"]) {
      const [client] = JSON.parse(
        admin("get", "clients", "-q", `clientId=${clientId}`),
      );
      if (!client) throw new Error(`Missing ${clientId} client.`);
      admin(
        "update",
        `clients/${client.id}/optional-client-scopes/${scope.id}`,
      );
      const normal = scopes.find(
        (item) => item.name === "mock_identity_vc_ldp",
      );
      if (normal) {
        // Certify stops at the first credential scope, even if another requested scope would match.
        admin(
          "update",
          `clients/${client.id}/optional-client-scopes/${normal.id}`,
        );
        const defaults = JSON.parse(
          admin("get", `clients/${client.id}/default-client-scopes`),
        );
        if (defaults.some((item) => item.id === normal.id))
          admin(
            "delete",
            `clients/${client.id}/default-client-scopes/${normal.id}`,
          );
      }
    }
  }
  console.log(
    "Signed expiry and DID fixtures and authorization scope configured. Restart Certify and Mimoto to refresh metadata caches.",
  );
} catch (error) {
  console.error(
    error instanceof Error && !("stderr" in error)
      ? error.message
      : "Could not configure local scenarios. Check database and Keycloak availability.",
  );
  process.exitCode = 1;
}
