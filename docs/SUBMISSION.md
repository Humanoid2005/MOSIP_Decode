# Submission

**MOSIP Decode 2026 · Problem statement 02: Build an Interoperability Playground for Verifiable Credentials**

This page maps each item in the submission guidelines to where it is, and gives the jury a short route through the project.

## Guideline checklist

| Item | Where |
| --- | --- |
| **Source code** (required) | This repository. Layout in the [README](../README.md#repository-layout) and [Architecture](ARCHITECTURE.md#code-organization). |
| **Working prototype** (required) | Runs locally with `npm start`. See [Install and run](../README.md#install-and-run). |
| **Usage and installation instructions** (required) | [README](../README.md#install-and-run), with [how to run each flow](../README.md#run-each-flow) and the [local setup guide](../infra/inji/README.md) |
| **API documentation** (required) | [API.md](API.md): every endpoint, its request and response formats, authentication and example use, plus the upstream APIs used |
| **Git history** (required) | This repository's commit history |
| **Pitch deck** (required) | Shared with the submission email |
| **Video demo** (required) | Shared with the submission email |
| **College or university credentials** (required) | Shared with the submission email, never stored in this repository |
| **Architecture diagram** | [ARCHITECTURE.md](ARCHITECTURE.md), with protocol diagrams in [PROTOCOL_FLOWS.md](PROTOCOL_FLOWS.md) |
| **Design mockups and wireframes** | [DESIGN.md](DESIGN.md): screen map, user flow, wireframes and screens |
| **Test data** | [TEST_DATA.md](TEST_DATA.md): accounts, credentials, sample inputs and sample reports |
| **Test cases and results** | [TEST_CASES.md](TEST_CASES.md), with the [interoperability matrix](INTEROP_MATRIX.md) and [dated validation record](LIVE_VALIDATION.md) |

The problem statement's own tasks and deliverables are tracked item by item in [PROBLEM_STATEMENT_COVERAGE.md](PROBLEM_STATEMENT_COVERAGE.md).

## The project in brief

### Problem

MOSIP's Inji stack issues, holds and verifies digital credentials using open standards: OpenID4VCI, OpenID4VP, W3C VC, SD-JWT VC and mDoc. Open standards only matter if implementations really work together, and that is hard to see. When a phone wallet talks directly to an issuer or verifier, the web page showing the QR code sees none of the exchange, so a failure gives integrators nothing to inspect. Nothing purpose-built lets someone run Inji end to end, look at every payload, and find out where it breaks.

### Solution

A Postman-style workbench for the Inji stack. Pick a wallet and a credential, then issue, hold, present and verify while watching each exchange as raw JSON and as a live sequence diagram.

- **Real services, real verdicts.** Inji Certify, Mimoto, Inji Web, Inji Verify and the Inji Mobile app do the work. The playground simulates no credential, signature or result.
- **It sees the wire.** A byte-preserving protocol bridge sits on the wallet's path without changing the identities wallets trust.
- **It checks independently.** The playground runs its own checks on each submission, so a verifier accepting something it should not is caught and reported.
- **It breaks things on purpose.** Eight negative scenarios tamper with signatures, claims, dates, nonces, types and formats, and tell a correct rejection apart from an accidental one.
- **It leaves evidence.** Every run has a downloadable report and a place in a filterable history.

### Technology stack

| Layer | Technology |
| --- | --- |
| Workbench | React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, Zustand, Mermaid.js |
| Orchestrator and bridge | Node.js 22, Express 5, TypeScript, WebSocket |
| Inji stack | Inji Certify 0.14, Mimoto 0.21, Inji Web 0.16, Inji Verify 0.17, Inji Mobile |
| Identity and storage | Keycloak 26, PostgreSQL 15 |
| Infrastructure | Docker Compose, nginx, Cloudflare quick tunnel |
| Quality | Node's test runner, ESLint, GitHub Actions |
| Standards | OpenID4VCI draft 13, OpenID4VP drafts 21–23, Presentation Exchange 2.0, W3C VC, IETF SD-JWT VC, ISO/IEC 18013-5 mDoc |

### Target audience

| Who | What they get |
| --- | --- |
| **Inji core teams** | Reproducible interoperability gaps, with requests, responses and suggested fixes |
| **Integrators and governments adopting Inji** | A hands-on way to understand the flows and check compatibility before building |
| **Wallet, issuer and verifier developers** | A test bench to try their own implementation against Inji, with every payload visible |
| **Students and the MOSIP community** | A visual way to learn how verifiable credential protocols work |

### Impact

- **26 interoperability gaps found** in the pinned Inji releases, 7 of them high severity, with evidence and target repositories. See [INTEROP_GAPS.md](INTEROP_GAPS.md).
- **Security-relevant findings.** Inji Verify 0.17 accepts SD-JWT presentations carrying the wrong nonce, and presentations that do not match its request. Standard wallets would never send these, which is why this needs a test bench to surface.
- **Proof across ecosystems.** Inji Certify and Inji Verify pass end to end with a wallet built outside Inji, and with the real Inji Mobile app on a phone.
- **Less integration time.** One command starts the full stack, and every fault comes with the payload that explains it.

## A 10-minute route for the jury

1. **Start it.** Run `npm start`, then open https://inji.127.0.0.1.sslip.io/playground/ and accept the certificate warning. ([Details](../README.md#install-and-run))
2. **Run a full journey.** Choose **Playground mock wallet · non-Inji** and **Farmer Credential (SD-JWT)**, then select **Start issuance**. Register an account when Keycloak asks, then present the credential.
3. **Read the evidence.** Open **Inspect exchanges** and **View sequence flow diagram**.
4. **Break it.** Use **Rerun with a scenario** to try **Bad signature**, which is rejected, then **Wrong presentation nonce**, which Inji Verify accepts. That second result is a real gap.
5. **Check the claims.** Read the [interoperability matrix](INTEROP_MATRIX.md) and [gap report](INTEROP_GAPS.md).
