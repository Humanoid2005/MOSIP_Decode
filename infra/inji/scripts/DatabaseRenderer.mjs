import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { root, definitionId } from "./Configuration.mjs";

export class DatabaseRenderer {
  constructor(configuration) {
    this.config = configuration;
  }

  async render(output) {
    const folder = resolve(output, "database");
    await mkdir(folder, { recursive: true });
    const source = resolve(root, "infra/inji/upstream");
    let certify = await readFile(resolve(source, "certify_init.sql"), "utf8");
    const oldDid =
      "did:web:8398-2405-201-1029-3025-e142-9ad3-e1f2-f543.ngrok-free.app";
    if (!certify.includes(oldDid))
      throw new Error(
        "Upstream Certify seed has changed; review the DID mapping.",
      );
    certify = certify.replaceAll(
      oldDid,
      this.config.issuerDid.replaceAll("'", "''"),
    );
    const template = certify.match(
      /'([A-Za-z0-9+/=]{200,})',\s*-- the VC template/,
    );
    if (!template)
      throw new Error("Unable to locate the upstream credential template.");
    const decoded = Buffer.from(template[1], "base64").toString("utf8");
    const updated = decoded.replace(
      "https://piyush7034.github.io/my-files/farmer.json",
      this.config.origin + "/config/farmer.json",
    );
    certify = certify.replace(
      template[1],
      Buffer.from(updated).toString("base64"),
    );
    const migrations = resolve(root, "infra/inji/migrations");
    const migration = (name) => readFile(resolve(migrations, name), "utf8");
    await writeFile(
      resolve(folder, "01-certify.sql"),
      certify + "\n" + (await migration("004-farmer-sd-jwt-certify.sql")) +
        (this.config.values.INJI_LOCAL_DEVELOPMENT === "true"
          ? "\n" + (await migration("006-synthetic-farmer-registry.sql")) +
            "\n" + (await migration("007-expired-credential.sql")) +
            "\n" + (await migration("008-unsupported-did-credential.sql")) +
            "\n" + (await migration("009-farmer-mdoc-certify.sql"))
          : ""),
    );
    await writeFile(
      resolve(folder, "02-mimoto.sql"),
      await readFile(resolve(source, "mimoto_init.sql")),
    );
    const descriptors = [
      {
        id: "farmer",
        format: { ldp_vc: { proof_type: ["Ed25519Signature2020"] } },
        constraints: {
          fields: [
            {
              path: ["$.type[*]"],
              filter: {
                type: "string",
                // Mimoto 0.21.0 matches pattern as a substring, not a regex; anchors never match.
                pattern: "FarmerCredential",
              },
            },
          ],
        },
      },
    ];
    const sql = (value) => "'" + value.replaceAll("'", "''") + "'";
    const seed =
      "\nINSERT INTO verify.presentation_definition (id, input_descriptors, name, purpose, vp_format) VALUES (" +
      sql(definitionId) +
      ", " +
      sql(JSON.stringify(descriptors)) +
      ", 'Farmer credential', " +
      "'Verify the locally issued farmer credential', " +
      sql(
        JSON.stringify({ ldp_vc: { proof_type: ["Ed25519Signature2020"] } }),
      ) +
      ");\n";
    await writeFile(
      resolve(folder, "03-verify.sql"),
      (await readFile(resolve(source, "verify_init.sql"), "utf8")).replace("input_descriptors jsonb", "input_descriptors text") +
        seed +
        (await migration("005-farmer-sd-jwt-verify.sql")),
    );
  }
}
