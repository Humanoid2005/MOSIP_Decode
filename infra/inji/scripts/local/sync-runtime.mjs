import { execFileSync } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { relative, resolve } from "node:path";
import { root } from "../Configuration.mjs";

const docker = (...args) => execFileSync("docker", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const volume = "inji-playground_runtime";
const helper = "inji-runtime-transfer";
async function fingerprint(path, hash) {
  if ((await stat(path)).isDirectory()) {
    for (const name of (await readdir(path)).sort()) {
      hash.update(name);
      await fingerprint(resolve(path, name), hash);
    }
  } else hash.update(await readFile(path));
}
try {
  const model = JSON.parse(docker("compose", "-f", "docker-compose.yml", "-f", "docker-compose.local.yml", "config", "--format", "json"));
  docker("volume", "create", volume);
  try { docker("container", "inspect", helper); }
  catch { docker("create", "--name", helper, "--mount", `type=volume,source=${volume},target=/runtime`, "node:22.22.0-bookworm-slim", "sh", "-c", "mkdir -p /runtime/config /runtime/generated /runtime/secrets"); }
  docker("start", "-a", helper);
  for (const directory of ["config", "generated"])
    docker("cp", resolve(root, "infra/inji", directory) + "/.", `${helper}:/runtime/${directory}/`);
  for (const file of await readdir(resolve(root, "infra/inji/secrets"))) {
    try { docker("cp", `${helper}:/runtime/secrets/${file}`, "-"); }
    catch { docker("cp", resolve(root, "infra/inji/secrets", file), `${helper}:/runtime/secrets/${file}`); }
  }
  for (const service of Object.values(model.services)) {
    const configurationHash = createHash("sha256");
    for (const mount of service.volumes ?? []) {
      if (mount.type !== "bind") continue;
      await fingerprint(mount.source, configurationHash);
      const subpath = relative(resolve(root, "infra/inji"), mount.source);
      if (subpath.startsWith("..")) throw new Error("Unexpected runtime mount outside infra/inji.");
      mount.type = "volume";
      mount.source = "runtime";
      mount.volume = { subpath, nocopy: true };
      delete mount.bind;
    }
    service.labels = { ...service.labels, "dev.inji.configuration": configurationHash.digest("hex") };
  }
  model.volumes.runtime = { name: volume, external: true };
  await writeFile(resolve(root, "infra/inji/generated/compose.runtime.json"), JSON.stringify(model, null, 2), { mode: 0o600 });
  console.log("Runtime volume synchronized. Start with docker compose -f infra/inji/generated/compose.runtime.json up -d --build.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
