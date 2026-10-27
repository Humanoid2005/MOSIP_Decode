This directory holds `oidckeystore.p12` (the onboarded Mimoto OIDC client key and certificate), `verify-keystore.p12` (an Ed25519 private key and certificate), the local CA and the gateway certificate. They are committed so the private team shares one development identity; remove them from history and regenerate them with `infra/inji/scripts/local/bootstrap.mjs` before the repository becomes public.

Mimoto's keystore is writable because its key manager also stores generated keys. The verifier keystore is read-only. Preserve Mimoto's keystore with its database; replacing only one can make stored wallet data unreadable.

To create a local verifier keystore later with JDK keytool (prompts for the password):

```powershell
keytool -genkeypair -alias verify -keyalg Ed25519 -storetype PKCS12 -keystore infra/inji/secrets/verify-keystore.p12 -dname "CN=Inji Playground" -validity 365
```

This does not onboard the separate Mimoto client. Use the issuer's onboarding process for that key and configure its registered alias in the root environment file.
