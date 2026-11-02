import { LocalDevelopment } from "./LocalDevelopment.mjs";
// Creates the root .env and the development keys and certificates for a fresh
// checkout (npm run bootstrap). It refuses to run when either already exists.
try {
  await new LocalDevelopment().prepare();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Local setup failed.");
  process.exitCode = 1;
}
