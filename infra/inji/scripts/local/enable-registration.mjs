import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Configuration, root } from "../Configuration.mjs";

const compose = ["compose", "-f", "docker-compose.yml", "-f", "docker-compose.local.yml", "exec", "-T"];
const run = (service, args, input) => execFileSync("docker", [...compose, service, ...args], {
  cwd: root, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"],
});
try {
  const configuration = await Configuration.load();
  if (configuration.values.INJI_LOCAL_DEVELOPMENT !== "true")
    throw new Error("Registration provisioning requires local development mode.");
  const sql = await readFile(resolve(root, "infra/inji/migrations/006-synthetic-farmer-registry.sql"), "utf8");
  run("database", ["psql", "-U", "postgres", "-d", "inji_certify", "-v", "ON_ERROR_STOP=1"], sql);
  run("keycloak", ["sh", "-c", '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080/auth --realm master --user admin --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"']);
  run("keycloak", ["/opt/keycloak/bin/kcadm.sh", "update", "realms/inji", "-s", "registrationAllowed=true"]);
  console.log("Local registration enabled and synthetic issuer registry prepared. Existing accounts and records preserved.");
} catch {
  console.error("Could not enable local registration. Confirm database/Keycloak are running with this checkout's configuration. Rerunning is safe.");
  process.exitCode = 1;
}
