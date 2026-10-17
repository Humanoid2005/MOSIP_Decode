import { createHash } from "node:crypto";
import { credentialFingerprint, matchesCredentialFormat, } from "../run-service/credentialFingerprint.js";
export class ProxyCaptureService {
    dao;
    runs;
    telemetry;
    tokens = new Map();
    constructor(dao, runs, telemetry) {
        this.dao = dao;
        this.runs = runs;
        this.telemetry = telemetry;
    }
    identify(role, path, authorization, request) {
        const active = this.runs.active();
        if (!active)
            return;
        if (role === "verify") {
            const state = request && typeof request === "object"
                ? request.state
                : undefined;
            return state === active.requestId ||
                path.includes(encodeURIComponent(active.requestId || active.id))
                ? active.id
                : undefined;
        }
        if (path.endsWith("/credential")) {
            const key = this.hash(authorization?.replace(/^Bearer /i, "") || "");
            return this.tokens.get(key) === active.id ? active.id : undefined;
        }
        return active.phase === "ISSUING" ? active.id : undefined;
    }
    capture(id, path, event) {
        if (!id)
            return;
        const run = this.dao.get(id);
        if (!["ISSUING", "HELD", "VERIFYING"].includes(run.phase))
            return;
        const body = event.response && typeof event.response === "object"
            ? event.response
            : {};
        if (event.status >= 200 && event.status < 300) {
            if (typeof body.access_token === "string") {
                this.tokens.set(this.hash(body.access_token), id);
                if (this.tokens.size > 200)
                    this.tokens.delete(this.tokens.keys().next().value);
            }
            if (path.endsWith("/credential") &&
                matchesCredentialFormat(body.credential, run.configuration.format)) {
                run.credentialObserved = true;
                run.credentialFingerprints.push(credentialFingerprint(body.credential));
                this.dao.save(run);
            }
        }
        this.telemetry.record(id, event);
    }
    hash(value) {
        return createHash("sha256").update(value).digest("hex");
    }
}
