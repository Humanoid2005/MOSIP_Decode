import { execFileSync } from "node:child_process";
import { Configuration } from "../Configuration.mjs";

const container = process.env.INJI_KEYCLOAK_CONTAINER || "inji-playground-keycloak-1";
const command = (...args) => execFileSync("docker", ["exec", container, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
try {
  const configuration = await Configuration.load();
  command("sh", "-c", '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080/auth --realm master --user admin --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"');
  const clients = JSON.parse(command("/opt/keycloak/bin/kcadm.sh", "get", "clients", "-r", "inji", "-q", "clientId=inji-wallet", "--fields", "id,redirectUris"));
  if (clients.length !== 1) throw new Error("Expected exactly one inji-wallet client.");
  const client = clients[0];
  const callback = configuration.origin + "/playground/wallet-callback";
  if (!client.redirectUris.includes(callback)) {
    command("/opt/keycloak/bin/kcadm.sh", "update", `clients/${client.id}`, "-r", "inji", "-s", `redirectUris=${JSON.stringify([...client.redirectUris, callback])}`);
  }
  console.log("Embedded wallet callback registered; existing client settings preserved.");
} catch {
  console.error("Could not update the local wallet client. Confirm Keycloak is running with the matching admin credentials and INJI_CONFIG_HOME.");
  process.exitCode = 1;
}
