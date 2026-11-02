import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { root } from "./Configuration.mjs";

// Creates a new local identity for npm run bootstrap: the root .env with random
// passwords, then the keystores, local CA, gateway certificate, Java truststore
// and wallet certificate in infra/inji/secrets. Passwords and keys must stay
// paired, so it stops if either already exists.
export class LocalDevelopment {
  async prepare() {
    const envPath = resolve(root, ".env");
    if (await access(envPath).then(() => true, () => false))
      throw new Error("Root .env already exists. Preserve it; run npm start.");
    const secrets = resolve(root, "infra/inji/secrets");
    await mkdir(secrets, { recursive: true });
    for (const name of ["oidckeystore.p12", "verify-keystore.p12", "local-ca.key", "gateway.key"])
      if (await access(resolve(secrets, name)).then(() => true, () => false))
        throw new Error("Existing development keys found. Restore the matching .env before preparing this environment.");
    const password = () => randomBytes(24).toString("hex");
    const origin = "https://inji.127.0.0.1.sslip.io";
    const auth = origin + "/auth/realms/inji";
    const values = {
      // Lets a plain `docker compose` load the local override with the base file.
      COMPOSE_FILE: "docker-compose.yml:docker-compose.local.yml",
      INJI_LOCAL_DEVELOPMENT: "true", INJI_PUBLIC_ORIGIN: origin,
      INJI_GATEWAY_PORT: "8091", INJI_TLS_PORT: "8443",
      POSTGRES_PASSWORD: password(), CERTIFY_KEYSTORE_PASSWORD: password(),
      MIMOTO_KEYSTORE_PASSWORD: password(), VERIFY_KEYSTORE_PASSWORD: password(),
      MINIO_ROOT_USER: "inji-local", MINIO_ROOT_PASSWORD: password(),
      AUTHORIZATION_ORIGIN: origin, AUTHORIZATION_ISSUER_URL: auth,
      AUTHORIZATION_JWKS_URL: auth + "/protocol/openid-connect/certs",
      AUTHORIZATION_TOKEN_URL: auth + "/protocol/openid-connect/token",
      AUTHORIZATION_CREDENTIAL_AUDIENCE: origin + "/v1/certify/issuance/credential",
      WALLET_CLIENT_ID: "inji-wallet", WALLET_CLIENT_ALIAS: "inji-wallet",
      WALLET_REDIRECT_URI: origin + "/redirect",
      GOOGLE_OAUTH_CLIENT_ID: "inji-web-login", GOOGLE_OAUTH_CLIENT_SECRET: password(),
      KEYCLOAK_ADMIN_PASSWORD: password(), LOCAL_FARMER_PASSWORD: password(),
    };
    // .env is written before any key, so a later failure cannot leave keys
    // whose passwords are lost.
    await writeFile(envPath, Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
    const run = (command, args) => execFileSync(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    // Mimoto's RSA keystore, whose key signs the inji-wallet client
    // assertions, and Verify's Ed25519 keystore.
    for (const [file, alias, algorithm, pass] of [
      ["oidckeystore.p12", "inji-wallet", "RSA", values.MIMOTO_KEYSTORE_PASSWORD],
      ["verify-keystore.p12", "verify", "Ed25519", values.VERIFY_KEYSTORE_PASSWORD],
    ]) {
      run("keytool", ["-genkeypair", "-alias", alias, "-keyalg", algorithm, "-storetype", "PKCS12", "-keystore", resolve(secrets, file), "-storepass", pass, "-dname", "CN=Inji Local Development", "-validity", "365"]);
    }
    // A local CA that signs the gateway's TLS certificate for the sslip.io
    // name, localhost and 127.0.0.1. Host trust settings are not changed.
    run("openssl", ["req", "-x509", "-newkey", "rsa:3072", "-nodes", "-days", "365", "-keyout", resolve(secrets, "local-ca.key"), "-out", resolve(secrets, "local-ca.crt"), "-subj", "/CN=Inji Playground Local CA", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign"]);
    run("openssl", ["req", "-newkey", "rsa:2048", "-nodes", "-keyout", resolve(secrets, "gateway.key"), "-out", resolve(secrets, "gateway.csr"), "-subj", "/CN=inji.127.0.0.1.sslip.io"]);
    await writeFile(resolve(secrets, "gateway.ext"), "subjectAltName=DNS:inji.127.0.0.1.sslip.io,DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n");
    run("openssl", ["x509", "-req", "-in", resolve(secrets, "gateway.csr"), "-CA", resolve(secrets, "local-ca.crt"), "-CAkey", resolve(secrets, "local-ca.key"), "-CAcreateserial", "-days", "365", "-out", resolve(secrets, "gateway.crt"), "-extfile", resolve(secrets, "gateway.ext")]);
    // The Java services trust the system CAs plus the local CA, so they can
    // call the public origin over HTTPS. changeit is the standard cacerts
    // password, which the Compose JVM options also use.
    await writeFile(resolve(secrets, "java-truststore"), await readFile("/etc/ssl/certs/java/cacerts"));
    run("keytool", ["-importcert", "-noprompt", "-alias", "inji-local-ca", "-file", resolve(secrets, "local-ca.crt"), "-keystore", resolve(secrets, "java-truststore"), "-storepass", "changeit"]);
    // The wallet certificate as bare base64 DER, for RealmRenderer.
    const certificate = run("keytool", ["-exportcert", "-rfc", "-alias", "inji-wallet", "-keystore", resolve(secrets, "oidckeystore.p12"), "-storepass", values.MIMOTO_KEYSTORE_PASSWORD]).toString().replace(/-----[^-]+-----|\s/g, "");
    await writeFile(resolve(secrets, "wallet-certificate.txt"), certificate, { mode: 0o600 });
    console.log("Created local configuration and keys. Login: farmer; password is LOCAL_FARMER_PASSWORD in root .env. No host trust settings were changed.");
  }
}
