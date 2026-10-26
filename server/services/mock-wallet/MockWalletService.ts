import type { ScenarioService } from "../scenario-service/ScenarioService.js";
import { credentialFingerprint } from "../run-service/credentialFingerprint.js";
import { randomUUID } from "node:crypto";
import type { HttpTransport, RunDao } from "../../models/contracts.js";
import type { TestRun } from "../../models/dtos.js";
import type { WalletSessionDao } from "../../models/WalletSession.js";
import type { RunService } from "../run-service/RunService.js";
import type { TelemetryService } from "../telemetry/TelemetryService.js";
import { AppError, UpstreamError, object, requiredString } from "../errors.js";
import {
  base64url,
  createHolderKey,
  decodeJwt,
  randomToken,
  sha256,
  signEs256,
} from "./jws.js";
import { presentSdJwt } from "./sdJwtPresentation.js";
import { verifyRequest, verifierPublicBase } from "./verifyRequest.js";
// Values received from Inji services; SD-JWTs and request objects exceed request-field limits.
function upstream(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new AppError(502, `The response is missing ${name}.`);
  return value.trim();
}
export const mockWalletFormats = ["vc+sd-jwt", "dc+sd-jwt"];
// A minimal OpenID4VCI / OpenID4VP holder used to test Inji modules against a
// non-Inji wallet. It uses public endpoints only, so its wire traffic passes
// through the protocol bridge exactly like an external wallet's would.
export class MockWalletService {
  constructor(
    private readonly dao: RunDao,
    private readonly sessions: WalletSessionDao,
    private readonly http: HttpTransport,
    private readonly runs: RunService,
    private readonly telemetry: TelemetryService,
    private readonly clientId: string,
    private readonly redirectUri: string,
    private readonly scenarios: ScenarioService,
  ) {}
  async authorize(runId: string): Promise<{ url: string }> {
    const run = this.walletRun(runId, "ISSUING");
    const issuer = object(
      await this.json(
        `${run.environment.issuerUrl}/.well-known/openid-credential-issuer`,
        "Issuer metadata",
      ),
    );
    const configuration = object(
      object(issuer.credential_configurations_supported)[run.configuration.id],
    );
    const authorizationServer = Array.isArray(issuer.authorization_servers)
      ? String(issuer.authorization_servers[0])
      : run.environment.issuerUrl;
    const server = object(
      await this.json(
        `${authorizationServer}/.well-known/oauth-authorization-server`,
        "Authorization server metadata",
      ),
    );
    const session = {
      runId,
      holder: createHolderKey(),
      state: randomToken(),
      codeVerifier: randomToken(),
      scope: upstream(configuration.scope, "scope"),
      credentialIssuer: upstream(issuer.credential_issuer, "credential_issuer"),
      credentialEndpoint: upstream(
        issuer.credential_endpoint,
        "credential_endpoint",
      ),
      tokenEndpoint: upstream(server.token_endpoint, "token_endpoint"),
      vct:
        typeof configuration.vct === "string" ? configuration.vct : undefined,
    };
    this.sessions.save(session);
    const parameters = {
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: session.scope,
      state: session.state,
      code_challenge: base64url(sha256(session.codeVerifier)),
      code_challenge_method: "S256",
    };
    const endpoint = upstream(
      server.authorization_endpoint,
      "authorization_endpoint",
    );
    this.record(runId, "Mock wallet authorization request", parameters, null);
    return { url: `${endpoint}?${new URLSearchParams(parameters)}` };
  }
  async complete(state: string, code: string): Promise<TestRun> {
    const session = this.sessions.findByState(state);
    if (!session)
      throw new AppError(404, "Unknown or expired mock wallet authorization.");
    const run = this.walletRun(session.runId, "ISSUING");
    const token = object(
      await this.send(session.tokenEndpoint, "Token request", {
        form: {
          grant_type: "authorization_code",
          code,
          redirect_uri: this.redirectUri,
          client_id: this.clientId,
          code_verifier: session.codeVerifier,
        },
      }),
    );
    const proofClaims = {
      iss: this.clientId,
      aud: session.credentialIssuer,
      iat: Math.floor(Date.now() / 1000),
      nonce: upstream(token.c_nonce, "c_nonce"),
    };
    const proofHeader = {
      typ: "openid4vci-proof+jwt",
      jwk: session.holder.publicJwk,
    };
    const proof = signEs256(proofHeader, proofClaims, session.holder);
    this.record(
      run.id,
      "Mock wallet proof of possession",
      decodeJwt(proof),
      null,
    );
    const response = object(
      await this.send(session.credentialEndpoint, "Credential request", {
        json: {
          format: run.configuration.format,
          ...(session.vct ? { vct: session.vct } : {}),
          proof: { proof_type: "jwt", jwt: proof },
        },
        accessToken: upstream(token.access_token, "access_token"),
      }),
    );
    session.credential = upstream(response.credential, "credential");
    this.sessions.save(session);
    const observed = this.dao.get(run.id);
    observed.credentialObserved = true;
    observed.credentialFingerprints.push(
      credentialFingerprint(session.credential),
    );
    this.dao.save(observed);
    return this.runs.confirmHolder(
      run.id,
      {
        title: "Mock wallet stored the credential",
        evidence:
          "Credential response received and stored by the playground mock wallet.",
      },
      "MOCK_WALLET",
    );
  }
  async present(runId: string): Promise<TestRun> {
    const run = this.walletRun(runId, "VERIFYING");
    const session = this.sessions.get(runId);
    if (!session?.credential)
      throw new AppError(
        409,
        "The mock wallet holds no credential for this run.",
      );
    const link = new URL(
      requiredString(run.presentationUri, "presentationUri"),
    );
    const requestUri = upstream(
      link.searchParams.get("request_uri"),
      "request_uri",
    );
    if (
      requestUri !==
      `${verifierPublicBase(run)}/vp-request/${encodeURIComponent(run.requestId!)}`
    )
      throw new AppError(
        502,
        "Unexpected verifier request URI. No credential was shared.",
      );
    const requestToken = upstream(
      await this.send(requestUri, "Presentation request object", {
        accept: "application/oauth-authz-req+jwt, application/jwt",
      }),
      "request",
    );
    const document = await this.json(
      `${run.environment.verifyUrl}/did.json`,
      "Configured verifier DID document",
    );
    let request: Record<string, unknown>;
    try {
      request = verifyRequest(requestToken, document, run);
    } catch (error) {
      this.scenarios.fail(
        runId,
        "REQUEST",
        "REQUEST_AUTHENTICATION_FAILED",
        error instanceof Error
          ? error.message
          : "Verifier request authentication failed.",
      );
      return this.dao.get(runId);
    }
    this.record(
      runId,
      "Verifier request signature and run binding verified",
      { clientId: request.client_id, state: request.state },
      { valid: true },
    );
    if (request.client_id !== link.searchParams.get("client_id"))
      throw new AppError(
        502,
        "The request object client_id does not match the presentation link.",
      );
    const definition = object(request.presentation_definition);
    const descriptor = object(
      Array.isArray(definition.input_descriptors)
        ? definition.input_descriptors[0]
        : undefined,
    );
    const vpToken = presentSdJwt(
      (await this.scenarios.credential(run, session.credential)) as string,
      session.holder,
      upstream(request.client_id, "client_id"),
      run.scenario === "WRONG_NONCE"
        ? "playground-deliberately-wrong-nonce"
        : upstream(request.nonce, "nonce"),
    );
    if (run.scenario === "WRONG_NONCE")
      this.scenarios.record(runId, {
        applied: true,
        stage: "SUBMISSION",
        changes: [
          {
            path: "keyBinding.nonce",
            before: request.nonce,
            after: "playground-deliberately-wrong-nonce",
          },
        ],
      });
    const submission = {
      id: randomUUID(),
      definition_id: upstream(definition.id, "presentation_definition.id"),
      descriptor_map: [
        {
          id: upstream(descriptor.id, "input_descriptors[0].id"),
          format: run.configuration.format,
          path: "$",
        },
      ],
    };
    this.record(
      runId,
      "Mock wallet key-bound presentation",
      {
        keyBinding: decodeJwt(vpToken.slice(vpToken.lastIndexOf("~") + 1)),
        disclosures: vpToken.split("~").length - 2,
        presentation_submission: submission,
      },
      null,
    );
    try {
      await this.send(
        upstream(request.response_uri, "response_uri"),
        "Presentation submission",
        {
          form: {
            vp_token: vpToken,
            presentation_submission: JSON.stringify(submission),
            state: upstream(request.state, "state"),
          },
        },
      );
    } catch (error) {
      if (
        error instanceof UpstreamError &&
        error.upstreamStatus >= 400 &&
        error.upstreamStatus < 500 &&
        error.upstreamStatus !== 429
      ) {
        this.scenarios.fail(
          runId,
          "SUBMISSION",
          "SUBMISSION_REJECTED",
          error.message,
        );
        return this.dao.get(runId);
      }
      throw error;
    }
    return this.dao.get(runId);
  }
  private walletRun(runId: string, phase: TestRun["phase"]): TestRun {
    const run = this.dao.get(runId);
    if (run.wallet !== "MOCK_WALLET")
      throw new AppError(409, "This run does not use the mock wallet.");
    if (run.phase !== phase)
      throw new AppError(
        409,
        `The mock wallet action requires phase ${phase}.`,
      );
    return run;
  }
  private json(url: string, title: string): Promise<unknown> {
    return this.send(url, title);
  }
  private async send(
    url: string,
    title: string,
    request: {
      form?: Record<string, string>;
      json?: unknown;
      accessToken?: string;
      accept?: string;
    } = {},
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: request.accept ?? "application/json",
    };
    let body: string | undefined;
    if (request.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(request.form).toString();
    } else if (request.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(request.json);
    }
    if (request.accessToken)
      headers.Authorization = `Bearer ${request.accessToken}`;
    const response = await this.http.send(url, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body,
    });
    if (response.status < 200 || response.status >= 300)
      throw new UpstreamError(
        response.status,
        `Mock wallet ${title.toLowerCase()} failed with HTTP ${response.status}. See the protocol inspector.`,
      );
    return response.body;
  }
  private record(
    runId: string,
    title: string,
    request: unknown,
    response: unknown,
  ) {
    this.telemetry.record(runId, {
      source: "WALLET",
      title,
      method: "",
      endpoint: "",
      status: 0,
      durationMs: 0,
      request,
      response,
    });
  }
}
