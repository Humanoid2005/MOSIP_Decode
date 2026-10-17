import { resolve } from "node:path";
import { Configuration, root } from "./Configuration.mjs";
import { AssetRenderer } from "./AssetRenderer.mjs";
import { DatabaseRenderer } from "./DatabaseRenderer.mjs";
import { RealmRenderer } from "./local/RealmRenderer.mjs";

try {
  const configuration = await Configuration.load();
  const output = resolve(root, "infra/inji/generated");
  await new AssetRenderer(configuration).render(output);
  await new DatabaseRenderer(configuration).render(output);
  await new RealmRenderer(configuration).render(output);
  console.log(
    "Prepared Inji configuration and playground endpoints. No Docker commands were executed.",
  );
  console.log(
    "Restart the playground server after starting the stack yourself.",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Unable to prepare configuration.",
  );
  process.exitCode = 1;
}
