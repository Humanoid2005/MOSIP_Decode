import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { root, definitionId } from "./Configuration.mjs";

// Renders the PostgreSQL init scripts in generated/database. PostgreSQL runs
// them only on an empty volume; existing volumes receive the same changes
// through the migrations and upgrade.mjs.
export class DatabaseRenderer {
  constructor(configuration) {
    this.config = configuration;
  }

  async render(output) {
    const folder = resolve(output, "database");
    await mkdir(folder, { recursive: true });
    const source = resolve(root, "infra/inji/upstream");
    let certify = await readFile(resolve(source, "certify_init.sql"), "utf8");
    // The upstream Certify seed names its issuer with a developer's ngrok DID,
    // which is replaced with this stack's did:web. A changed seed fails here
    // rather than keeping a foreign issuer DID.
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
    // The VC template is a base64 literal marked by the seed's
    // "-- the VC template" comment. Its JSON-LD context URL is moved to the
    // copy this stack serves at /config/farmer.json.
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
    // Certify seed and the SD-JWT configuration. Local development adds the
    // synthetic farmer registry, the two negative-scenario fixtures and the
    // mDoc configuration, in migration order.
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
    // Verify's presentation definition for the JSON-LD Farmer credential.
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
    // Uses a text input_descriptors column, as migration 001 does for existing
    // databases, then adds the JSON-LD and SD-JWT (migration 005) definitions.
    await writeFile(
      resolve(folder, "03-verify.sql"),
      (await readFile(resolve(source, "verify_init.sql"), "utf8")).replace("input_descriptors jsonb", "input_descriptors text") +
        seed +
        (await migration("005-farmer-sd-jwt-verify.sql")),
    );
  }
}
