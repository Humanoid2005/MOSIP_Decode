// Brings volumes created before the workbench callback, self-registration, negative
// scenarios and the mDoc credential up to date. Every step is additive and safe to rerun;
// fresh volumes need none of it.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Configuration, root } from "./Configuration.mjs";

const compose = (...args) =>
  execFileSync("docker", ["compose", ...args], {
    cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  });
// Runs a command in a running service container; input is passed on stdin.
const exec = (service, args, input) =>
  execFileSync("docker", ["compose", "exec", "-T", service, ...args], {
    cwd: root, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"],
  });
// Runs kcadm against the inji realm, using the login made below.
const admin = (...args) =>
  exec("keycloak", ["/opt/keycloak/bin/kcadm.sh", ...args, "-r", "inji"]);
const migration = (name) =>
  readFile(resolve(root, "infra/inji/migrations", name), "utf8");

try {
  const configuration = await Configuration.load();
  if (configuration.values.INJI_LOCAL_DEVELOPMENT !== "true")
    throw new Error("Upgrades apply only to the local development stack.");

  // Migrations 006 to 009 skip anything that already exists, so they can be
  // applied again in one psql session that stops at the first error.
  const sql = (await Promise.all([
    "006-synthetic-farmer-registry.sql",
    "007-expired-credential.sql",
    "008-unsupported-did-credential.sql",
    "009-farmer-mdoc-certify.sql",
  ].map(migration))).join("\n");
  exec("database", ["psql", "-U", "postgres", "-d", "inji_certify", "-v", "ON_ERROR_STOP=1"], sql);

  // The admin password is read from the Keycloak container's environment, so
  // it never appears in this process's arguments. Self-registration lets the
  // workbench's optional account step create users.
  exec("keycloak", ["sh", "-c", '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080/auth --realm master --user admin --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"']);
  admin("update", "realms/inji", "-s", "registrationAllowed=true");

  // Adds the embedded wallet's callback to Mimoto's client.
  const [wallet] = JSON.parse(admin("get", "clients", "-q", "clientId=inji-wallet", "--fields", "id,redirectUris"));
  if (!wallet) throw new Error("Missing inji-wallet client.");
  const callback = configuration.origin + "/playground/wallet-callback";
  if (!wallet.redirectUris.includes(callback))
    admin("update", `clients/${wallet.id}`, "-s", `redirectUris=${JSON.stringify([...wallet.redirectUris, callback])}`);

  // Creates each missing fixture scope as a copy of the JSON-LD scope, so it
  // carries the same nonce and audience mappers, and offers it to the two
  // clients below. Mobile mode adds it to Inji Mobile's wallet client on its
  // next start.
  const scopes = JSON.parse(admin("get", "client-scopes"));
  const normal = scopes.find((item) => item.name === "mock_identity_vc_ldp");
  if (!normal) throw new Error("The normal JSON-LD scope is missing.");
  for (const name of ["mock_identity_vc_expired", "mock_identity_vc_unsupported_did", "mock_identity_vc_mdoc"]) {
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
