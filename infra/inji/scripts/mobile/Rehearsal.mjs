import { Configuration } from "../Configuration.mjs";
import { InjiMobileSimulator } from "./InjiMobileSimulator.mjs";
import { walletMdocChecks } from "./MdocWalletCheck.mjs";

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

// Drives a real workbench run with the simulated phone over the public origin.
export class Rehearsal {
  // api is the playground server's API on this computer.
  constructor(log = console.log, api = "http://127.0.0.1:8000/api/v1") {
    this.log = log;
    this.api = api;
  }

  // Issues the first non-fixture credential of the given format to a simulated
  // phone, signed in as the seeded farmer, and checks that the bridge saw it.
  // How the run continues from there depends on the format.
  async run(format) {
    const config = await Configuration.load();
    const { configurations } = await this.call("/issuer");
    const configuration = configurations.find(
      (item) => item.format === format && !/Expired|UnsupportedDid/.test(item.id),
    );
    if (!configuration) throw new Error(`The issuer advertises no ${format} credential.`);
    let run = await this.call("/runs", { wallet: "INJI_MOBILE", configurationId: configuration.id });
    if (run.phase !== "ISSUING") throw new Error(run.error ?? `Run ${run.id} did not start.`);
    this.log(`Run ${run.id}: ${configuration.id} (${format})`);
    const phone = new InjiMobileSimulator();
    const issued = await phone.issue(run.offerUri, {
      username: "farmer",
      password: config.values.LOCAL_FARMER_PASSWORD,
    });
    run = await this.call(`/runs/${run.id}`);
    this.log(`Issued over ${config.origin}; bridge observed the credential: ${run.credentialObserved}`);
    if (!run.credentialObserved) throw new Error("The bridge did not correlate the issued credential with this run.");
    if (format === "mso_mdoc") {
      const stored = walletMdocChecks(issued.credential);
      this.log(`The wallet's mDoc checks passed for ${stored.docType} (signed by ${stored.certificate}).`);
    }
    // Confirms receipt and requests verification, as the workbench buttons do.
    await this.call(`/runs/${run.id}/holder`, {});
    run = await this.call(`/runs/${run.id}/presentation`, {});
    if (format === "mso_mdoc") {
      // Inji Verify has no mDoc presentation path; the workbench checks the held mDoc directly.
      const report = await this.call(`/runs/${run.id}/report`);
      const signature = run.verification?.checks.find((check) => check.id === "issuer-signature");
      this.log(
        `Inji Verify verdict: ${run.verdict}${signature?.detail ? ` (${signature.detail})` : ""}${run.error ? ` (${run.error})` : ""}; interoperability outcome: ${report.outcome}`,
      );
      if (!["COMPLETED", "FAILED"].includes(run.phase)) throw new Error("Inji Verify returned no decision.");
      return run.id;
    }
    if (format === "ldp_vc") {
      await phone.authenticateRequest(run.presentationUri);
      await this.call(`/runs/${run.id}/cancel`, {});
      this.log("Verifier request authenticated against its did:web key. JSON-LD presentation signing needs the real app; run cancelled.");
      return run.id;
    }
    // SD-JWT: presents, then waits up to two minutes for Verify's decision.
    await phone.presentSdJwt(run.presentationUri, issued.credential);
    for (let attempt = 0; attempt < 40 && run.phase === "VERIFYING"; attempt++) {
      await pause(3000);
      run = await this.call(`/runs/${run.id}`);
    }
    const report = await this.call(`/runs/${run.id}/report`);
    this.log(`Verify verdict: ${run.verdict}; interoperability outcome: ${report.outcome}`);
    if (report.outcome !== "PASS") throw new Error(run.error ?? "The rehearsal did not pass.");
    return run.id;
  }

  // Calls the API as the workbench does: POST with a JSON body when one is
  // given, GET otherwise.
  async call(path, body) {
    const response = await fetch(this.api + path, {
      method: body ? "POST" : "GET",
      headers: { origin: "http://localhost:5173", "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status} for ${path}`);
    return payload;
  }
}
