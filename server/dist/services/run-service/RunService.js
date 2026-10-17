import { randomUUID } from "node:crypto";
import { AppError, object, requiredString } from "../errors.js";
export class RunService {
    dao;
    env;
    issuer;
    telemetry;
    offers;
    starting = false;
    constructor(dao, env, issuer, telemetry, offers) {
        this.dao = dao;
        this.env = env;
        this.issuer = issuer;
        this.telemetry = telemetry;
        this.offers = offers;
    }
    active() {
        return this.dao
            .all()
            .find((run) => ["ISSUING", "HELD", "VERIFYING"].includes(run.phase));
    }
    isBusy() {
        return this.starting || Boolean(this.active());
    }
    async start(value) {
        if (this.isBusy())
            throw new AppError(409, "Finish or cancel the current run before starting another.");
        this.starting = true;
        try {
            const input = object(value);
            if (!["INJI_MOBILE", "INJI_WEB"].includes(String(input.wallet)))
                throw new AppError(422, "Select an Inji wallet.");
            const environment = this.env.get();
            if (input.wallet === "INJI_WEB" && !environment.webWalletUrl)
                throw new AppError(409, "Configure the Inji Web URL first.");
            const discovery = await this.issuer.discover(environment);
            const configuration = discovery.configurations.find((config) => config.id === input.configurationId);
            if (!configuration)
                throw new AppError(422, "Choose a credential configuration advertised by this issuer.");
            const timestamp = new Date().toISOString();
            const run = {
                id: randomUUID(),
                createdAt: timestamp,
                updatedAt: timestamp,
                wallet: input.wallet,
                configuration,
                environment,
                phase: "ISSUING",
                verdict: "PENDING",
                holderConfirmed: false,
                credentialObserved: false,
                credentialMatched: false,
                credentialFingerprints: [],
                events: [],
            };
            this.dao.save(run);
            try {
                await this.issuer.discover(environment, run.id);
                if (typeof input.offer === "string" && input.offer.trim()) {
                    const resolved = await this.offers.resolve(input.offer, run);
                    const latest = this.dao.get(run.id);
                    if (latest.phase !== "ISSUING")
                        return latest;
                    latest.offerUri = resolved.uri;
                    this.dao.save(latest);
                    this.telemetry.record(run.id, {
                        source: "USER",
                        title: "Issuer-provided credential offer",
                        method: "",
                        endpoint: "",
                        status: 0,
                        durationMs: 0,
                        request: resolved.offer,
                        response: null,
                    });
                }
            }
            catch (error) {
                const latest = this.dao.get(run.id);
                if (latest.phase !== "ISSUING")
                    return latest;
                latest.phase = "FAILED";
                latest.verdict = "ERROR";
                latest.error =
                    error instanceof Error
                        ? error.message
                        : "Unable to initiate issuance.";
                this.dao.save(latest);
            }
            this.telemetry.notify(run.id);
            return this.dao.get(run.id);
        }
        finally {
            this.starting = false;
        }
    }
    confirmHolder(id) {
        const run = this.dao.get(id);
        if (run.phase !== "ISSUING")
            throw new AppError(409, "Holder confirmation is only available during issuance.");
        run.phase = "HELD";
        run.holderConfirmed = true;
        run.offerUri = undefined;
        this.dao.save(run);
        this.telemetry.record(id, {
            source: "USER",
            title: "Holder confirmed credential receipt",
            method: "",
            endpoint: "",
            status: 0,
            durationMs: 0,
            request: null,
            response: { evidence: "User confirmation; not a wallet callback." },
        });
        return this.dao.get(id);
    }
    cancel(id) {
        const run = this.dao.get(requiredString(id, "runId"));
        if (!["ISSUING", "HELD", "VERIFYING"].includes(run.phase))
            throw new AppError(409, "This run is already finished.");
        run.phase = "CANCELLED";
        run.presentationUri = undefined;
        run.offerUri = undefined;
        run.updatedAt = new Date().toISOString();
        this.dao.save(run);
        this.telemetry.notify(id);
        return run;
    }
}
