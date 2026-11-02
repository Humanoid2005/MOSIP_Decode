import type { HolderKey } from "../../models/WalletSession.js";
import { AppError } from "../errors.js";
import { base64url, decodeJwt, sha256, signEs256 } from "./jws.js";
// Builds an SD-JWT presentation disclosing every issued claim, bound to the
// verifier's audience and nonce with a Key Binding JWT (SD-JWT section 4.3).
export function presentSdJwt(
  credential: string,
  holder: HolderKey,
  audience: string,
  nonce: string,
): string {
  const [issuerJwt, ...rest] = credential.split("~");
  const disclosures = rest.filter(Boolean);
  const algorithm = decodeJwt(issuerJwt ?? "").payload._sd_alg ?? "sha-256";
  if (algorithm !== "sha-256")
    throw new AppError(
      422,
      `The mock wallet supports sha-256 disclosures only, not ${String(algorithm)}.`,
    );
  // sd_hash covers the issuer JWT and these disclosures, so the key binding
  // cannot be moved to a different selection of claims.
  const presented = `${[issuerJwt, ...disclosures].join("~")}~`;
  const keyBinding = signEs256(
    { typ: "kb+jwt" },
    {
      iat: Math.floor(Date.now() / 1000),
      aud: audience,
      nonce,
      sd_hash: base64url(sha256(presented)),
    },
    holder,
  );
  return presented + keyBinding;
}
