export class ConnectionService {
    env;
    http;
    issuer;
    constructor(env, http, issuer) {
        this.env = env;
        this.http = http;
        this.issuer = issuer;
    }
    async check() {
        const env = this.env.get();
        return Promise.all([
            ["Inji Certify", env.certifyUrl],
            ["Mimoto", env.mimotoUrl],
            ["Inji Verify", env.verifyUrl],
        ].map(async ([service, url]) => {
            if (!url)
                return {
                    service,
                    state: "UNCONFIGURED",
                    detail: "No URL configured.",
                };
            try {
                if (service === "Inji Certify") {
                    const discovery = await this.issuer.discover(env);
                    return {
                        service,
                        state: "REACHABLE",
                        detail: `${discovery.configurations.length} supported credential configurations discovered.`,
                    };
                }
                const response = await this.http.send(url);
                return {
                    service,
                    state: "REACHABLE",
                    detail: `Service responded with HTTP ${response.status}. Protocol compatibility has not been checked.`,
                };
            }
            catch (error) {
                return {
                    service,
                    state: "ERROR",
                    detail: error instanceof Error ? error.message : "Connection failed.",
                };
            }
        }));
    }
}
