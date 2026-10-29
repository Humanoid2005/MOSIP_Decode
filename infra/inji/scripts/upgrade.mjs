// Brings volumes created before the workbench callback, self-registration and negative
// scenarios up to date. Every step is additive and safe to rerun; fresh volumes need none of it.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Configuration, root } from "./Configuration.mjs";

const compose = (...args) =>
  execFileSync("docker", ["compose", ...args], {
    cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  });
const exec = (service, args, input) =>
  execFileSync("docker", ["compose", "exec", "-T", service, ...args], {
    cwd: root, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"],
  });
const admin = (...args) =>
  exec("keycloak", ["/opt/keycloak/bin/kcadm.sh", ...args, "-r", "inji"]);
const migration = (name) =>
  readFile(resolve(root, "infra/inji/migrations", name), "utf8");

try {
  const configuration = await Configuration.load();
  if (configuration.values.INJI_LOCAL_DEVELOPMENT !== "true")
    throw new Error("Upgrades apply only to the local development stack.");

  const sql = (await Promise.all([
    "006-synthetic-farmer-registry.sql",
    "007-expired-credential.sql",
    "008-unsupported-did-credential.sql",
  ].map(migration))).join("\n");
  exec("database", ["psql", "-U", "postgres", "-d", "inji_certify", "-v", "ON_ERROR_STOP=1"], sql);

  exec("keycloak", ["sh", "-c", '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080/auth --realm master --user admin --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"']);
  admin("update", "realms/inji", "-s", "registrationAllowed=true");

  const [wallet] = JSON.parse(admin("get", "clients", "-q", "clientId=inji-wallet", "--fields", "id,redirectUris"));
  if (!wallet) throw new Error("Missing inji-wallet client.");
  const callback = configuration.origin + "/playground/wallet-callback";
  if (!wallet.redirectUris.includes(callback))
    admin("update", `clients/${wallet.id}`, "-s", `redirectUris=${JSON.stringify([...wallet.redirectUris, callback])}`);

  const scopes = JSON.parse(admin("get", "client-scopes"));
  const normal = scopes.find((item) => item.name === "mock_identity_vc_ldp");
  if (!normal) throw new Error("The normal JSON-LD scope is missing.");
  for (const name of ["mock_identity_vc_expired", "mock_identity_vc_unsupported_did"]) {
    let scope = scopes.find((item) => item.name === name);
    if (!scope) {
      const mappers = (normal.protocolMappers ?? []).map(({ id, ...mapper }) => mapper);
      admin("create", "client-scopes", "-s", `name=${name}`, "-s", "protocol=openid-connect",
        "-s", `attributes=${JSON.stringify(normal.attributes)}`,
        "-s", `protocolMappers=${JSON.stringify(mappers)}`);
      scope = JSON.parse(admin("get", "client-scopes")).find((item) => item.name === name);
    }
    for (const clientId of ["inji-wallet", "playground-mock-wallet"]) {
      const [client] = JSON.parse(admin("get", "clients", "-q", `clientId=${clientId}`));
      if (!client) throw new Error(`Missing ${clientId} client.`);
      admin("update", `clients/${client.id}/optional-client-scopes/${scope.id}`);
      // Certify stops at the first credential scope, even if another requested scope would match.
      admin("update", `clients/${client.id}/optional-client-scopes/${normal.id}`);
      const defaults = JSON.parse(admin("get", `clients/${client.id}/default-client-scopes`));
      if (defaults.some((item) => item.id === normal.id))
        admin("delete", `clients/${client.id}/default-client-scopes/${normal.id}`);
    }
  }

  // Both services cache issuer metadata and scopes.
  compose("restart", "certify", "mimoto-service");
  console.log("Upgraded the local stack. Existing accounts, wallets and credentials were preserved.");
} catch (error) {
  console.error(
    error instanceof Error && !("stderr" in error)
      ? error.message
      : "Upgrade failed. Start the stack first with npm start; rerunning is safe.",
  );
  process.exitCode = 1;
}
