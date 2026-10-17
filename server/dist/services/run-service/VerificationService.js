import { AppError } from "../errors.js";
import { credentialFingerprint } from "./credentialFingerprint.js";
export class VerificationService {
    dao;
    verifier;
    telemetry;
    busy = new Set();
    lastPoll = new Map();
    constructor(dao, verifier, telemetry) {
        this.dao = dao;
        this.verifier = verifier;
        this.telemetry = telemetry;
    }
    async begin(id) {
        const run = this.dao.get(id);
        if (run.phase !== "HELD" || this.busy.has(id))
            throw new AppError(409, "Confirm wallet receipt before requesting a presentation.");
        this.busy.add(id);
        try {
            const result = await this.verifier.create(run);
            const latest = this.dao.get(id);
            if (latest.phase !== "HELD")
                return latest;
            latest.phase = "VERIFYING";
            latest.requestId = result.requestId;
            latest.transactionId = result.transactionId;
            latest.presentationUri = result.uri;
            latest.error = undefined;
            this.dao.save(latest);
            this.telemetry.notify(id);
            return latest;
        }
        finally {
            this.busy.delete(id);
        }
    }
    async refresh(id) {
        const run = this.dao.get(id);
        if (run.phase !== "VERIFYING" ||
            this.busy.has(id) ||
            Date.now() - (this.lastPoll.get(id) || 0) < 2000)
            return run;
        this.busy.add(id);
        this.lastPoll.set(id, Date.now());
        if (this.lastPoll.size > 100)
            this.lastPoll.delete(this.lastPoll.keys().next().value);
        try {
            const status = await this.verifier.status(run);
            if (status === "ACTIVE")
                return this.dao.get(id);
            if (status !== "VP_SUBMITTED") {
                const latest = this.dao.get(id);
                if (latest.phase !== "VERIFYING")
                    return latest;
                latest.phase = "FAILED";
                latest.verdict = "ERROR";
                latest.error =
                    status === "EXPIRED"
                        ? "Presentation request expired. Start a new run."
                        : `Presentation ended with status ${status}.`;
                latest.presentationUri = undefined;
                this.dao.save(latest);
                this.telemetry.notify(id);
                return latest;
            }
            const result = await this.verifier.result(run);
            const latest = this.dao.get(id);
            if (latest.phase !== "VERIFYING")
                return latest;
            latest.result = result.payload;
            latest.verdict = result.verdict;
            latest.phase = "COMPLETED";
            latest.presentationUri = undefined;
            latest.credentialMatched = result.credentials.some((credential) => latest.credentialFingerprints.includes(credentialFingerprint(credential)));
            latest.updatedAt = new Date().toISOString();
            this.dao.save(latest);
            this.telemetry.notify(id);
            return latest;
        }
        finally {
            this.busy.delete(id);
        }
    }
}
