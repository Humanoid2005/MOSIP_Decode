import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import { mobileClientId, mobileRedirectUri } from "../RealmRenderer.mjs";

// Reproduces the network behaviour of Inji Mobile 0.22.1 (inji-vci-client and
// inji-openid4vp 0.7.0) closely enough to rehearse a phone session without a
// phone: offer parsing, authorization server discovery, the fixed public
// client, proof and request shapes, and did:web request authentication.
const b64 = (value) => Buffer.from(value).toString("base64url");
const sha256 = (value) => createHash("sha256").update(value).digest();
const json = (value) => b64(JSON.stringify(value));

export class InjiMobileSimulator {
  constructor(request = fetch) {
    this.request = (url, init = {}) =>
      request(url, { redirect: "manual", signal: AbortSignal.timeout(20000), ...init });
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const { kty, crv, x, y } = publicKey.export({ format: "jwk" });
    this.holder = { privateKey, jwk: { kty, crv, x, y } };
  }

  // Scan & Download Card with an authorization-code offer.
  async issue(offerUri, account) {
    // The wallet splits the query on "=" before decoding the offer value.
    const [, query = ""] = offerUri.split("://?");
    const [name, value] = query.split("=");
    if (name !== "credential_offer" || !value) throw new Error("Unsupported offer URI.");
    const offer = JSON.parse(decodeURIComponent(value));
    if (!String(offer.credential_issuer).startsWith("https://"))
      throw new Error("Credential issuer must use HTTPS.");
    if (offer.credential_configuration_ids?.length !== 1)
      throw new Error("Batch offers are rejected.");
    const issuer = await this.json(offer.credential_issuer + "/.well-known/openid-credential-issuer");
    const configuration = issuer.credential_configurations_supported[offer.credential_configuration_ids[0]];
    const server = issuer.authorization_servers?.length === 1
      ? issuer.authorization_servers[0]
      : offer.grants?.authorization_code?.authorization_server ?? offer.credential_issuer;
    const as = await this.json(server + "/.well-known/oauth-authorization-server")
      .catch(() => this.json(server + "/.well-known/openid-configuration"));
    if (as.issuer !== server) throw new Error(`Authorization server issuer ${as.issuer} differs from ${server}.`);

    const verifier = b64(randomBytes(32));
    const authorize = new URL(as.authorization_endpoint);
    for (const [key, item] of Object.entries({
      client_id: mobileClientId,
      redirect_uri: mobileRedirectUri,
      response_type: "code",
      scope: configuration.scope ?? "openid",
      state: b64(randomBytes(16)),
      code_challenge: b64(sha256(verifier)),
      code_challenge_method: "S256",
      nonce: b64(randomBytes(16)),
    }))
      authorize.searchParams.set(key, item);
    const code = await this.signIn(authorize, account);

    const tokenResponse = await this.request(as.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: mobileClientId,
        redirect_uri: mobileRedirectUri,
        code_verifier: verifier,
      }),
    });
    const token = await this.expectJson(tokenResponse, "Token request");

    // The wallet's offer-flow proof has no iss claim and names a did:jwk key.
    const proof = this.signJwt(
      { typ: "openid4vci-proof+jwt", kid: `did:jwk:${json(this.holder.jwk)}#0` },
      { aud: offer.credential_issuer, nonce: token.c_nonce, iat: Math.floor(Date.now() / 1000) },
    );
    const body = { format: configuration.format, proof: { proof_type: "jwt", jwt: proof } };
    if (configuration.format === "ldp_vc") body.credential_definition = configuration.credential_definition;
    else if (configuration.format === "mso_mdoc") Object.assign(body, { doctype: configuration.doctype, claims: configuration.claims });
    else body.vct = configuration.vct;
    const credentialResponse = await this.request(issuer.credential_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token.access_token}` },
      body: JSON.stringify(body),
    });
    const { credential } = await this.expectJson(credentialResponse, "Credential request");
    return { format: configuration.format, credential };
  }

  // Scan with a cross-device OpenID4VP request that uses a did client_id.
  async authenticateRequest(presentationUri) {
    const link = new URL(presentationUri.replace("openid4vp://", "https://wallet.invalid/"));
    const clientId = link.searchParams.get("client_id") ?? "";
    if (!clientId.startsWith("did:")) throw new Error(`Unsupported client_id ${clientId}.`);
    const response = await this.request(link.searchParams.get("request_uri"));
    if (!response.headers.get("content-type")?.includes("application/oauth-authz-req+jwt"))
      throw new Error("Request object has the wrong content type.");
    const jar = await response.text();
    const [header, payload] = jar.split(".").slice(0, 2).map((part) => JSON.parse(Buffer.from(part, "base64url")));
    if (header.alg !== "EdDSA" || !header.kid?.startsWith(clientId + "#"))
      throw new Error("Request object must be EdDSA-signed by the verifier DID.");
    const [, , host, ...path] = clientId.split(":").map(decodeURIComponent);
    const document = await this.json(
      `https://${[host, ...(path.length ? path : [".well-known"])].join("/")}/did.json`,
    );
    const method = document.verificationMethod?.find((item) => item.id === header.kid);
    const key = base58(method?.publicKeyMultibase?.slice(1) ?? "");
    const [signed, signature] = [jar.slice(0, jar.lastIndexOf(".")), jar.slice(jar.lastIndexOf(".") + 1)];
    const valid = key.length === 34 && verify(
      null,
      Buffer.from(signed),
      createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: b64(key.subarray(2)) }, format: "jwk" }),
      Buffer.from(signature, "base64url"),
    );
    if (!valid) throw new Error("Request object signature does not match the verifier DID.");
    if (payload.client_id !== clientId || payload.response_mode !== "direct_post")
      throw new Error("Request object client or response mode is unexpected.");
    return payload;
  }

  async presentSdJwt(presentationUri, credential) {
    const request = await this.authenticateRequest(presentationUri);
    const presented = credential.endsWith("~") ? credential : credential + "~";
    const binding = this.signJwt(
      { typ: "kb+jwt" },
      {
        iat: Math.floor(Date.now() / 1000),
        aud: request.client_id,
        nonce: request.nonce,
        sd_hash: b64(sha256(presented)),
      },
    );
    const definition = request.presentation_definition;
    const response = await this.request(request.response_uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        // Inji Mobile 0.22 sends a single SD-JWT as a JSON string, quotes included.
        vp_token: JSON.stringify(presented + binding),
        presentation_submission: JSON.stringify({
          id: randomUUID(),
          definition_id: definition.id,
          descriptor_map: [{ id: definition.input_descriptors[0].id, format: "vc+sd-jwt", path: "$" }],
        }),
        state: request.state,
      }),
    });
    if (!response.ok) throw new Error(`Submission returned HTTP ${response.status}: ${await response.text()}`);
  }

  // Keycloak's login form, submitted the way the wallet's in-app web view would.
  async signIn(url, { username, password }) {
    const cookies = new Map();
    const remember = (response) => {
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(";");
        const index = pair.indexOf("=");
        cookies.set(pair.slice(0, index), pair.slice(index + 1));
      }
    };
    const cookie = () => [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
    const page = await this.request(url);
    remember(page);
    const html = await page.text();
    const action = /<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/.exec(html)?.[1];
    if (!action) throw new Error(`No Keycloak login form (HTTP ${page.status}).`);
    const submitted = await this.request(action.replaceAll("&amp;", "&"), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() },
      body: new URLSearchParams({ username, password, credentialId: "" }),
    });
    const location = submitted.headers.get("location") ?? "";
    if (!location.startsWith(mobileRedirectUri)) throw new Error(`Sign-in did not return to the app (HTTP ${submitted.status}).`);
    const code = new URL(location.replace(mobileRedirectUri, "https://app.invalid/")).searchParams.get("code");
    if (!code) throw new Error("Sign-in returned no authorization code.");
    return code;
  }

  signJwt(header, payload) {
    const input = `${json({ ...header, alg: "ES256" })}.${json(payload)}`;
    return `${input}.${b64(sign("sha256", Buffer.from(input), { key: this.holder.privateKey, dsaEncoding: "ieee-p1363" }))}`;
  }

  async json(url) {
    return this.expectJson(await this.request(url, { headers: { accept: "application/json" } }), new URL(url).pathname);
  }

  async expectJson(response, label) {
    const text = await response.text();
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  }
}

function base58(value) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) return Buffer.alloc(0);
    number = number * 58n + BigInt(digit);
  }
  const hex = number.toString(16);
  return Buffer.concat([
    Buffer.alloc(value.match(/^1*/)[0].length),
    Buffer.from(hex.length % 2 ? `0${hex}` : hex, "hex"),
  ]);
}
