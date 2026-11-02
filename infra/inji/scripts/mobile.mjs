import { MobileMode } from "./mobile/MobileMode.mjs";
import { Rehearsal } from "./mobile/Rehearsal.mjs";

// Switches the running stack to or from a phone-reachable origin for Inji
// Mobile, reports its state, or rehearses a phone session without a phone.
// node infra/inji/scripts/mobile.mjs start [--origin https://stable.example] | stop | status
//   | rehearse [--format vc+sd-jwt|ldp_vc|mso_mdoc]
const [command = "status", ...args] = process.argv.slice(2);
const option = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const mode = new MobileMode();

// Prints the MobileDoctor results and exits non-zero if any check failed.
function report(checks) {
  for (const check of checks)
    console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}: ${check.detail}`);
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

try {
  if (command === "start") {
    const { origin, checks } = await mode.start(option("--origin"));
    console.log(`\nPhone-reachable origin: ${origin}`);
    console.log("Workbench (this computer only): http://localhost:5173");
    report(checks);
    console.log(
      "\nChoose Inji Mobile in the workbench. In the app: Add card → Scan & Download Card for issuance, the Share tab for verification.",
    );
  } else if (command === "stop") {
    await mode.stop();
    console.log("Mobile mode stopped; the stack uses the origin in .env again.");
  } else if (command === "status") {
    const state = await mode.status();
    if (state.unfinished) {
      console.log(
        `The last mobile.mjs ${state.on ? "start" : "stop"} did not finish: Certify and Keycloak still use ${state.unfinished}. Run it again to complete the switch.`,
      );
      process.exitCode = 1;
    } else if (!state.on) console.log("Mobile mode is off.");
    else if (!state.reachable) {
      console.log(
        `Mobile mode is on, but ${state.origin} is not reachable.` +
          (state.tunnel
            ? " Quick tunnels can drop after some hours. Run mobile.mjs start for a new URL, then issue the card again."
            : " Check the tunnel or proxy that serves it."),
      );
      process.exitCode = 1;
    } else {
      console.log(`Mobile mode is on: ${state.origin}`);
      report(state.checks);
    }
  } else if (command === "rehearse") {
    // Simulates Inji Mobile end to end, so a session can be checked without a phone.
    await new Rehearsal().run(option("--format") ?? "vc+sd-jwt");
  } else {
    console.error(
      "Usage: mobile.mjs start [--origin https://…] | stop | status | rehearse [--format vc+sd-jwt|ldp_vc|mso_mdoc]",
    );
    process.exitCode = 2;
  }
} catch (error) {
  console.error(
    error?.stderr ? String(error.stderr).trim() || error.message : error.message,
  );
  process.exitCode = 1;
}
