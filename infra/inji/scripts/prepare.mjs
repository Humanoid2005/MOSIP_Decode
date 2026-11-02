import { resolve } from "node:path";
import { Configuration, root } from "./Configuration.mjs";
import { AssetRenderer } from "./AssetRenderer.mjs";
import { DatabaseRenderer } from "./DatabaseRenderer.mjs";
import { RealmRenderer } from "./RealmRenderer.mjs";

// Renders service properties, issuer and verifier assets, database seeds and
// the Keycloak realm from the root .env and secrets/ into infra/inji/generated.
// npm start runs it before Compose. While mobile mode is on, the files carry
// the mobile origin, because Configuration.load() applies it.
try {
  const configuration = await Configuration.load();
  const output = resolve(root, "infra/inji/generated");
  await new AssetRenderer(configuration).render(output);
  await new DatabaseRenderer(configuration).render(output);
  // Runs last: it writes Keycloak's database script into the database folder
  // that DatabaseRenderer creates.
  await new RealmRenderer(configuration).render(output);
  console.log("Prepared Inji configuration and playground endpoints.");
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Unable to prepare configuration.",
  );
  process.exitCode = 1;
}
