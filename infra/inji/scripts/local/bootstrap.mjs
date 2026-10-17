import { LocalDevelopment } from "./LocalDevelopment.mjs";
try {
  await new LocalDevelopment().prepare();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Local setup failed.");
  process.exitCode = 1;
}
