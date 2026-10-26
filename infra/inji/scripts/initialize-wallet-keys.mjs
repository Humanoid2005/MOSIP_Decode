import { constants } from "node:fs";
import { copyFile, chown, chmod } from "node:fs/promises";

const destination = "/keys/oidckeystore.p12";
try {
  await copyFile("/seed/oidckeystore.p12", destination, constants.COPYFILE_EXCL);
  await chown(destination, 1002, 1001);
  await chmod(destination, 0o600);
  await chown("/keys", 1002, 1001);
  await chmod("/keys", 0o700);
  console.log("Initialized the persistent Mimoto keystore.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Preserved the existing Mimoto keystore.");
}
