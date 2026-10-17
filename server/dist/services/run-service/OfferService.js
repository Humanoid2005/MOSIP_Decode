import { AppError, object } from "../errors.js";
export class OfferService {
    http;
    constructor(http) {
        this.http = http;
    }
    async resolve(input, run) {
        if (input.length > 16000)
            throw new AppError(422, "Credential offer is too large.");
        let offer;
        if (input.trim().startsWith("{")) {
            try {
                offer = object(JSON.parse(input));
            }
            catch {
                throw new AppError(422, "Credential offer must contain valid JSON.");
            }
        }
        else {
            let url;
            try {
                url = new URL(input);
            }
            catch {
                throw new AppError(422, "Paste a credential-offer URI or JSON.");
            }
            if (url.protocol !== "openid-credential-offer:")
                throw new AppError(422, "Expected an openid-credential-offer URI.");
            const inline = url.searchParams.get("credential_offer");
            const reference = url.searchParams.get("credential_offer_uri");
            if (Boolean(inline) === Boolean(reference))
                throw new AppError(422, "Offer must use exactly one of credential_offer or credential_offer_uri.");
            if (inline) {
                try {
                    offer = object(JSON.parse(inline));
                }
                catch {
                    throw new AppError(422, "Invalid offer JSON.");
                }
            }
            else {
                let offerUrl;
                try {
                    offerUrl = new URL(reference);
                }
                catch {
                    throw new AppError(422, "Invalid credential_offer_uri.");
                }
                const issuer = new URL(run.environment.issuerUrl);
                if (offerUrl.origin !== issuer.origin ||
                    offerUrl.username ||
                    offerUrl.password ||
                    !(offerUrl.pathname === issuer.pathname ||
                        offerUrl.pathname.startsWith(`${issuer.pathname.replace(/\/$/, "")}/`)))
                    throw new AppError(422, "Offer reference must be hosted under the configured issuer URL.");
                const upstream = run.environment.certifyUrl +
                    offerUrl.pathname.slice(issuer.pathname.replace(/\/$/, "").length) +
                    offerUrl.search;
                offer = object(await this.http.json(upstream, "Credential offer", run.id));
            }
        }
        if (offer.credential_issuer !== run.environment.issuerUrl)
            throw new AppError(422, "Offer issuer does not match the configured issuer.");
        if (!Array.isArray(offer.credential_configuration_ids) ||
            !offer.credential_configuration_ids.includes(run.configuration.id))
            throw new AppError(422, "Offer does not include the selected credential configuration.");
        return {
            uri: `openid-credential-offer://?${new URLSearchParams({ credential_offer: JSON.stringify(offer) })}`,
            offer,
        };
    }
}
