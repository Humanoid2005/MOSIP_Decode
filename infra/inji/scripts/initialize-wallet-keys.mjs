import { constants } from "node:fs";
import { copyFile, chown, chmod } from "node:fs/promises";

// Runs in the one-shot wallet-keys-init container before Mimoto starts. Seeds
// the wallet-keys volume with the tracked keystore only when the volume has
// none, so the copy Mimoto updates is never replaced.
const destination = "/keys/oidckeystore.p12";
try {
  await copyFile("/seed/oidckeystore.p12", destination, constants.COPYFILE_EXCL);
  // 1002:1001 is the user and group Mimoto runs as; access is owner-only.
  await chown(destination, 1002, 1001);
  await chmod(destination, 0o600);
  await chown("/keys", 1002, 1001);
  await chmod("/keys", 0o700);
  console.log("Initialized the persistent Mimoto keystore.");
} catch (error) {
  // An existing keystore may hold Mimoto's changes and must stay paired with
  // postgres-data, so it is kept as is.
  if (error.code !== "EEXIST") throw error;
  console.log("Preserved the existing Mimoto keystore.");
}
