import { MobileMode } from "./mobile/MobileMode.mjs";
import { Rehearsal } from "./mobile/Rehearsal.mjs";

// node infra/inji/scripts/local/mobile.mjs start [--origin https://stable.example] | stop | status
//   | rehearse [--format vc+sd-jwt|ldp_vc]
const [command = "status", ...args] = process.argv.slice(2);
const option = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const mode = new MobileMode();

function report(checks) {
  for (const check of checks)
    console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}: ${check.detail}`);
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

try {
  if (command === "start") {
    const checks = await mode.start(option("--origin"));
    const { origin } = await mode.status().then((state) => state ?? {});
    console.log(`\nPhone-reachable origin: ${origin}`);
    console.log("Workbench (this computer only): http://localhost:5173");
    report(checks);
    console.log(
      "\nChoose Inji Mobile in the workbench. In the app: Add card → Scan & Download Card for issuance, Scan for verification.",
    );
  } else if (command === "stop") {
    await mode.stop();
    console.log("Mobile mode stopped; the stack uses the origin in .env again.");
  } else if (command === "status") {
    const state = await mode.status();
    if (!state) console.log("Mobile mode is off.");
    else {
      console.log(`Mobile mode is on: ${state.origin}`);
      report(state.checks);
    }
  } else if (command === "rehearse") {
    // Simulates Inji Mobile end to end, so a session can be checked without a phone.
    await new Rehearsal().run(option("--format") ?? "vc+sd-jwt");
  } else {
    console.error(
      "Usage: mobile.mjs start [--origin https://…] | stop | status | rehearse [--format vc+sd-jwt|ldp_vc]",
    );
    process.exitCode = 2;
  }
} catch (error) {
  console.error(
    error?.stderr ? String(error.stderr).trim() || error.message : error.message,
  );
  process.exitCode = 1;
}
