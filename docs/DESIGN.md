# Design

How the workbench is laid out and why, with the user flows, wireframes and the screens as built. The approved visual design was created in MagicPath; the screenshots below are the running application.

## Design goals

A protocol test bench can easily become a wall of JSON. The workbench keeps one question on screen at a time.

| Principle | In the workbench |
| --- | --- |
| **One step at a time** | Configure, Issue & hold, and Present & verify are separate stages. The panel shows only the current one. |
| **Evidence beside the verdict** | The result card shows why a run passed or failed, and leads to the exact exchange. |
| **Details on request** | Passing checks, applied changes and wallet links stay collapsed. Failed checks are always open. |
| **Plain, honest language** | "HTTP status shows delivery, not credential acceptance." Inji's verdict and the playground's own checks are never merged. |
| **Say why, not just no** | Unavailable combinations are disabled with the reason, such as why Mimoto cannot present SD-JWT. |

## Screen map

```mermaid
flowchart LR
    kc["Keycloak sign-in<br/>external page"]
    wb["Workbench<br/>run a flow"]
    seq["Sequence diagram<br/>dialog"]
    insp["Protocol inspector<br/>every exchange"]
    hist["Run history<br/>filter · export"]

    kc <-->|"Sign in"| wb
    wb -->|"View sequence flow diagram"| seq
    wb -->|"Inspect exchanges"| insp
    hist -->|"Select a run"| insp

    classDef play fill:#eef2ff,stroke:#4f46e5,color:#1e1b4b
    classDef ext fill:#fff7ed,stroke:#c2410c,color:#431407
    class wb,seq,insp,hist play
    class kc ext
```

The sidebar moves between the Workbench, Protocol inspector and Run history at any time.

## User flow

Every wallet follows the same journey. Only the issuance and sharing steps differ.

```mermaid
flowchart TD
    start(["Open the workbench"]) --> config["Configure<br/>wallet · credential · scenario"]
    config --> issue["Start issuance"]
    issue --> wallet{"Which wallet?"}
    wallet -->|"Embedded"| w1["Sign in · unlock with PIN<br/>Authorize and receive"]
    wallet -->|"Mock"| w2["Sign in and issue"]
    wallet -->|"Inji Mobile"| w3["Scan the offer QR<br/>Trust the issuer · sign in"]
    wallet -->|"Inji Web"| w4["Download in Inji Web"]
    w1 & w2 --> held["Credential held"]
    w3 & w4 --> confirm["I received the credential"]
    confirm --> held
    held --> request["Request verification"]
    request --> share["Share from the wallet"]
    share --> result["Result card<br/>verdict · checks · outcome"]
    result --> next{"What next?"}
    next -->|"Check the payloads"| inspect["Inspect exchanges<br/>or sequence diagram"]
    next -->|"Keep the evidence"| export["Export report"]
    next -->|"Test a fault"| replay["Rerun with a scenario"]
    replay --> issue

    classDef play fill:#eef2ff,stroke:#4f46e5,color:#1e1b4b
    classDef wallet fill:#fff7ed,stroke:#c2410c,color:#431407
    classDef done fill:#ecfdf5,stroke:#047857,color:#022c22
    class config,issue,held,request,inspect,export,replay,confirm play
    class w1,w2,w3,w4,share wallet
    class result done
```

## Wireframes

### Workbench

```text
+-----------+--------------------------------------------------------------+
| inji.     | Inji stack / Developer workspace           (•) Live updates  |
|           +--------------------------------------------------------------+
| Workbench |  One flow. Every exchange.                                   |
| Inspector |                                                              |
| History   |  (1) Configure -> (2) Issue & hold -> (3) Present & verify   |
|           |                                [View sequence flow diagram]  |
|           |  +--------------+   +--------------+   +--------------+      |
|           |  | 01 / ISSUER  |   | 02 / HOLDER  |   | 03 / VERIFIER|      |
|           |  | Inji Certify |   | chosen wallet|   | Inji Verify  |      |
|           |  +--------------+   +--------------+   +--------------+      |
|           |  +-----------------------------+   +--------------------+    |
|           |  | CURRENT STAGE               |   | Follow the protocol|    |
|           |  |                             |   |                    |    |
|           |  | Configure: wallet,          |   | Latest exchanges   |    |
|           |  |   credential, scenario      |   | with HTTP status   |    |
|           |  | Issue: QR code or wallet    |   |                    |    |
|           |  | Verify: QR code or approval |   | Open protocol      |    |
|           |  | Result: verdict and checks  |   | inspector ->       |    |
|           |  +-----------------------------+   +--------------------+    |
+-----------+--------------------------------------------------------------+
```

### Protocol inspector

```text
+-----------+--------------------------------------------------------------+
| inji.     |  Every exchange, in context.                                 |
|           |  [ Run: selected run        v ]  [ Filter exchanges        ] |
| Workbench |  +--------------------------------------------------------+  |
| Inspector |  | Verification evidence: verdict, checks, match, receipt |  |
| History   |  +--------------------------------------------------------+  |
|           |  +--------------------+-----------------------------------+  |
|           |  | EXCHANGES          | Selected exchange      [copy][full]|  |
|           |  | 01 Issuer metadata | [Request] [Response]  [ ] Decode   |  |
|           |  | 02 Credential offer| POST https://…                     |  |
|           |  | 03 /token          | { raw JSON payload,                |  |
|           |  | 04 /credential     |   tokens redacted }                |  |
|           |  | 05 …               |                                    |  |
|           |  +--------------------+-----------------------------------+  |
+-----------+--------------------------------------------------------------+
```

## From the problem statement's mock to the build

| Mock in the brief | In the workbench |
| --- | --- |
| Issuer, wallet and verifier columns | Issuer, holder and verifier cards, with the wallet and credential chosen under **Configure your flow** |
| Step 1: Issue → Step 2: Verify | Three-step indicator, adding **Configure** |
| Active workflow panel with QR code or status | The current stage panel |
| Protocol inspector panel | **Follow the protocol** beside each stage, and a full **Protocol inspector** page, so payloads get the room they need |
| Result: pass or fail with an error log | Result card with the verdict, each check, and the outcome |

## Screens

### Configure

Choosing a wallet explains what it needs. Choosing a scenario states what is expected.

![Workbench, configuring a flow](screenshots/workbench.png)

For Inji Mobile, the workbench says whether the phone can reach the issuer, and what to do if it cannot.

| Ready | Not ready |
| --- | --- |
| ![Inji Mobile with a phone-reachable issuer](screenshots/mobile-ready.png) | ![Warning when the issuer only resolves locally](screenshots/mobile-not-ready.png) |

### Issue and verify

Each QR code comes with the exact steps in the app, and a copyable link for requests too large to scan.

| Issuance | Verification |
| --- | --- |
| ![Offer QR code](screenshots/mobile-issuance-qr.png) | ![Verifier QR code](screenshots/mobile-verification-qr.png) |

### Results

A pass, a correct rejection and an interoperability gap each read differently, and each one names the check responsible.

| Pass | Correct rejection | Gap found |
| --- | --- | --- |
| ![Completed run with a pass](screenshots/mobile-result.png) | ![Bad signature rejected](screenshots/scenario-rejected.png) | ![Wrong nonce accepted](screenshots/scenario-unexpected-acceptance.png) |

### Sequence diagram

A live Mermaid diagram of the run. Arrows animate in as exchanges are observed, and selecting one opens its payload. This one is from a run on a physical phone.

![Sequence diagram of a phone run](screenshots/mobile-sequence.png)

### Protocol inspector

![Protocol inspector](screenshots/mobile-inspector.png)

### Run history

Summary counts, filters for outcome, format, scenario and stack version, and a report download per run.

![Run history](screenshots/run-history.png)
