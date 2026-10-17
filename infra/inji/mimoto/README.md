# Mimoto local compatibility fix

The pinned 0.21.0 image throws a null-pointer exception on repeat login when the identity provider omits an optional profile picture. `UserMetadataService.updateIfChanged` calls `current.equals(newValue)` even when the decrypted current value is null.

The included source is from [Mimoto 0.21.0](https://github.com/inji/mimoto/blob/48259310977b06c72401a41b666852362bf20bbc/src/main/java/io/mosip/mimoto/service/UserMetadataService.java), under MPL-2.0 (see `../upstream/LICENSE`). Its only behavior change is null-safe equality using `Objects.equals`. Encryption, persistence, identity mapping and authentication remain upstream implementations.

The image compiles that class against the exact image's application classes and dependencies, then replaces the class in the executable JAR. Upgrade or remove this fix when adopting an upstream release containing it. No credentials or verification results are substituted.

The local image also includes `WalletKeyHealthIndicator`, which exercises the real wallet encryption/decryption service. The upstream HSM health probe assumes a symmetric key stored directly in the HSM; this wallet uses RSA master keys and database-encrypted PII keys. Local configuration disables that incompatible probe and uses the wallet encryption round trip instead, alongside the database health check.
