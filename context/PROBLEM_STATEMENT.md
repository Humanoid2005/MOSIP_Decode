# MOSIP Digital Identity Stack: Interoperability Playground

## Introduction and Problem Statement

* **Inji Certify (Issuer):** Generates and digitally signs credentials (national IDs, driver's licenses).  
* **Inji Wallet (Holder):** An app (mobile or web) where citizens store their digital IDs safely.  
* **Inji Verify (Verifier):** An app or scanner service that checks if a credential presented by a citizen is valid.



If Inji Certify only talks to Inji Wallet, and Inji Wallet only works with Inji Verify, MOSIP has built a closed system.



Global bodies created open protocols so any wallet works with any issuer and verifier:

* **OpenID4VCI**: Open standard for an Issuer to push a credential into any Wallet.  
* **OpenID4VP**: Open standard for a Verifier to request and receive a credential from any Wallet via QR code or link.



The entire Inji stack is explicitly built around these specifications

* **Inji Certify (Issuer):** Implements OpenID4VCI (draft 13) to expose credential endpoints.  
* **Inji Wallet (Holder):** Implements both

  * **OpenID4VCI** to pull credentials down into the wallet from Inji Certify (or any compliant issuer).  
  * **OpenID4VP** (draft 21–23) via the inji-openid4vp library to present credentials to verifiers.  
* **Inji Verify (Verifier):** Implements OpenID4VP to construct presentation requests (presentation\_definition) and receive verifiable presentations (vp\_token) from wallets.  



The Interoperability Playground acts as the test bench to plug in any combination, execute these exact OpenID4VCI and OpenID4VP handshakes, inspect the raw JSON traffic, and prove where interoperability works and where it breaks.



**Deliverable:** A functional web application that acts as a test bench for the digital identity stack, complete with source code, documentation, and a demo video.

The goal is to provide a "Postman-style" visual workbench that proves standard compliance across Inji and external mocks, catching edge cases and format bugs across the verifiable credential lifecycle.

### Screen UI Mock

```
+-------------------------------------------------------------------------------+
|  [Select Issuer]              [Select Wallet]             [Select Verifier]   |
|  (•) Inji Certify             (•) Inji Mobile (QR)        (•) Inji Verify     |
|  ( ) Mock Issuer (Walt.id)    ( ) Inji Web                ( ) Mock Verifier   |
+-------------------------------------------------------------------------------+
|                      [ Step 1: ISSUE ]   --->   [ Step 2: VERIFY ]            |
+---------------------------------------+---------------------------------------+
|           ACTIVE WORKFLOW              |          PROTOCOL INSPECTOR          |
|                                        |                                      |
|  [ Shows QR Code or Status Spinner ]   |  Live Network Payload (JSON):        |
|  "Scan this to receive your ID..."     |  {                                   |
|                                        |    "type": "VerifiableCredential",   |
|                                        |    "format": "SD-JWT",               |
|                                        |    "issuer": "did:web:certify..."    |
|                                        |  }                                   |
+---------------------------------------+---------------------------------------+
|  RESULT:  [ PASS / FAIL ] (Detailed error log if it breaks)                   |
+-------------------------------------------------------------------------------+
```

### Flow 1: Issuing the ID (Getting the card into the wallet)

1. **Pick & Click** — You choose **Inji Certify** in Column 1 and **Inji Mobile Wallet** in Column 2. You hit "Issue".
2. **QR Code Pops Up** — Inji Certify generates a "Credential Offer" (a package that says: *"Hey, I have a driver's license ready for you"*). The UI converts this into a QR code on the screen.
3. **Wallet Scans** — You pick up your phone, open the Inji Wallet app, and scan the QR code.
4. **Behind-the-Scenes Handshake (OpenID4VCI)** — The wallet talks to the issuer over the network, proves who it is, and downloads the signed digital ID into the phone.
5. **What Your Playground Shows:**
   - An on-screen message confirming: *"Credential successfully received by wallet!"*
   - The Protocol Inspector panel displays the exact JSON payload the issuer sent over the wire.

### Flow 2: Verifying the ID (Proving who you are)

1. **Pick & Click** — In Column 3, you select **Inji Verify** and hit "Request Verification".
2. **New QR Code Pops Up** — Inji Verify displays a verification QR code that basically asks: *"Show me your name and birth date"* (the `presentation_definition`).
3. **Wallet Scans** — You use your phone's Inji Wallet to scan the screen.
4. **Behind-the-Scenes Handshake (OpenID4VP)** — Your phone creates a signed package (`vp_token`), sends it to Inji Verify, and Inji Verify checks the cryptographic signatures.
5. **What Your Playground Shows:**
   - A verification badge: **Valid** (green), **Invalid** (red), or **Expired** (orange).
   - The Protocol Inspector updates with the exact proof payload the wallet sent to the verifier.

**The Live Protocol Inspector (Deep Visibility):** Rather than outputting plain terminal logs, the UI needs an inspector panel that exposes raw protocol payloads at every handshake step:
- **OpenID4VCI (Issuance):** Auth request, Token exchange, Credential Offer JSON, Proof of Possession, and the issued VC.  
- **OpenID4VP (Presentation):** presentation_definition, user authorization, the returned vp_token, and the verification decision.


## Technical Stack and Components

**1. Playground Application**

* **Frontend UI**
* **Framework:** React + TypeScript using Vite or Next.js.


* **Styling:** Tailwind CSS.


* **Pre-built SDK Components:** `@mosip/react-inji-verify-sdk` (provides plug-and-play components like `QRCodeVerification` and `OpenID4VPVerification`).


* **Visualizations:** `Mermaid.js` (for interactive sequence diagrams) or a custom WebSocket-driven timeline for live network traffic, used in the *Live Protocol Inspector*.


* **Backend Orchestrator (BFF):**
* **Framework:** Node.js (Express) or Java (Spring Boot).


* **Role:** Acts as an API gateway that calls Inji Certify, Mimoto, and Inji Verify, intercepts the raw network payloads, and streams normalized JSON events to the UI inspector.

* **Infrastructure & Tooling:**
* **Containerization:** Docker & Docker Compose.


* **Tunneling / Networking:** `ngrok` or local reverse proxies (mandatory for routing mobile wallet QR scans on your phone to your local machine).





---

**2. Issuer Module (Inji Certify)**

* **Core Service:** Java with Spring Boot (runs via Docker Compose).


* **Architecture:** Plugin-based issuance framework.


* Uses mock plugins or MOSIP ID / eSignet-backed identity provider plugins.




* **Protocol & Specifications:** OpenID4VCI (Draft 13).


* **Database & Caching:** PostgreSQL and Redis.


* **External Reference Alternative:** A mocked standards-compliant issuer using frameworks like Walt.id or Sphereon.



---

**3. Wallet Modules (Holders)**

* **Inji Mobile Wallet:**
* **Frontend:** React Native (TypeScript).


* **Backend Bridge (BFF):** **Mimoto** (Java / Spring Boot service that talks between the mobile app and identity registries).


* **QR / Data Compression:** `mosip/pixelpass` (compresses large credential payloads into scannable QR matrices).


* **Protocol Library:** `inji-openid4vp` (native Kotlin/Swift bindings) and `inji-vci-client`.


* **Device-Level Sharing:** Tuvali (Kotlin library for offline Bluetooth Low Energy / BLE transfer).




* **Inji Web Wallet:**
* **Framework:** React + TypeScript (runs in the browser).


* **Backend:** Mimoto (Java).





---

**4. Verifier Module (Inji Verify)**

* **Core Engine:** **verify-service** built with Java and Spring Boot.


* **Default Web UI:** **verify-ui** built with React.


* **Lightweight Embedded Alternative:** The standalone `inji-verify-sdk` / `@mosip/react-inji-verify-sdk` npm package, which allows embedding verification directly into the Playground UI without running the full verify-service UI.


* **Protocol & Specifications:** OpenID4VP (Drafts 21–23) and Presentation Exchange (PEX 2.0).


* **External Reference Alternative:** Walt.id or Sphereon relying-party mock.



---

**Credential Formats & Cryptographic Tooling Across the Stack**

* **W3C VC (Data Model 1.1 / 2.0):** JSON-LD format signed with `Ed25519Signature2020` or `RSA` cryptographic proof suites.


* **IETF SD-JWT VC:** Salted-hash Selective Disclosure JWTs signed using standard JOSE suites (`EdDSA`, `ES256`).


* **ISO/IEC 18013-5 (mDoc / mDL):** CBOR / COSE-based mobile driving license format (mock mode).

## Resources & Reference Links

This document catalogues all external documentation, GitHub repositories, sandbox environments, and community resources referenced in the Inji Interoperability Playground specification.

---

## 1. Inji Documentation

* **[Inji Docs Overview & Features](https://docs.inji.io/)**

*High-level overview of the Inji stack architecture, design principles, and end-to-end credential lifecycle capabilities.*
* **[Inji Certify Overview](https://www.google.com/search?q=https://docs.inji.io/inji-certify)**

*Architecture guide and documentation for Inji Certify, covering plugin-based credential issuance and OpenID4VCI draft 13 compliance[cite: 19, 20].*
* **[Inji Verify Overview](https://www.google.com/search?q=https://docs.inji.io/inji-verify)**

*Documentation detailing Inji Verify architecture, verification rules, supported proof formats, and cryptographic validation suites[cite: 19, 20].*
* **[Inji Wallet (Mobile) Technical Overview](https://www.google.com/search?q=https://docs.inji.io/inji-wallet)**

*Technical specifications of the React Native mobile wallet, detailing Tuvali BLE transfer, Mimoto integration, and credential storage[cite: 20].*
* **[Inji Web Local Setup Guide](https://www.google.com/search?q=https://docs.inji.io/inji-web/setup)**

*Step-by-step instructions for running and configuring the Inji Web browser wallet locally[cite: 20].*
* **[OpenID4VP Integration Guide (Inji Verify SDK)](https://www.google.com/search?q=https://docs.inji.io/inji-verify/openid4vp-guide)**

*Developer guide explaining how to integrate the OpenID4VP relying-party protocol using the Inji Verify SDK.*
* **[Inji Resources: Webinars & Deep Dives](https://www.google.com/search?q=https://docs.inji.io/resources)**

*Video walkthroughs, architecture presentations, and engineering recordings covering verifiable credential standards across the Inji ecosystem.*

---

## 2. GitHub Repositories & NPM Packages

* **[`mosip/inji-wallet`](https://github.com/mosip/inji-wallet)**
*Source code for the Inji Mobile Wallet application built with React Native[cite: 20].*
* **[`mosip/inji-web`](https://github.com/mosip/inji-web)**
*Source code for the browser-based Inji Web wallet built with React and TypeScript[cite: 20].*
* **[`mosip/inji-certify`](https://github.com/mosip/inji-certify)**
*Source code for the Spring Boot-based credential issuance platform implementing OpenID4VCI draft 13[cite: 19, 20].*
* **[`mosip/inji-verify`](https://github.com/mosip/inji-verify)**
*Source code containing the `verify-service` (Spring Boot), `verify-ui` (React), standalone SDK, and end-to-end API test suites[cite: 20, 22].*
* **[`mosip/inji-openid4vp`](https://github.com/mosip/inji-openid4vp)**
*Kotlin and Swift protocol client library used by Inji Wallets to handle OpenID4VP presentation requests and responses[cite: 20].*
* **[`mosip/react-inji-verify-sdk` (NPM)](https://www.google.com/search?q=https://www.npmjs.com/package/%40mosip/react-inji-verify-sdk)**
*(Migrated to [`@injistack/react-inji-verify-sdk`](https://www.google.com/search?q=https://www.npmjs.com/package/%40injistack/react-inji-verify-sdk)) Ready-to-use React components including `QRCodeVerification` and `OpenID4VPVerification` for UI integration[cite: 20].*
* **[`mosip/pixelpass` (NPM)](https://www.google.com/search?q=https://www.npmjs.com/package/%40mosip/pixelpass)**[cite: 20]
*(Migrated to [`@injistack/pixelpass`](https://www.google.com/search?q=https://www.npmjs.com/package/%40injistack/pixelpass)) Data compression and decompression utility designed to pack credential payloads into scannable QR matrices[cite: 20].*
* **[`mosip/inji-config`](https://www.google.com/search?q=https://github.com/mosip/inji-config)**
*Repository housing shared ecosystem configuration files, specifically `mimoto-issuers-config.json` for mapping issuers to the Mimoto wallet backend.*

---

## 3. MOSIP Collab Sandbox Environment (Reference Only)

*Use the Collab sandbox to test and integrate existing Inji services without needing to run every backend service locally.*

* **[Collab Environment Guide](https://www.google.com/search?q=https://docs.mosip.io/collab/sandbox-guide)**
*Guide explaining connectivity, access credentials, and testing protocols for the shared MOSIP Collab cloud environment.*
* **[Mimoto Backend-for-Frontend (BFF)](https://www.google.com/search?q=https://collab.mosip.net/mimoto)**
*Pre-deployed instance of Mimoto bridging Inji Wallets to identity registries and credential issuance endpoints[cite: 20].*
* **[eSignet Identity Provider](https://www.google.com/search?q=https://collab.mosip.net/esignet)**
*MOSIP's OpenID Connect-based authentication service, used as an identity backing provider for issuing credentials[cite: 20].*
* **[Inji Certify (Mock Issuer - Collab)](https://www.google.com/search?q=https://collab.mosip.net/inji-certify)**
*Live Inji Certify instance configured with mock credential issuers for OpenID4VCI testing[cite: 20].*
* **[External VC Playground (Reference Only)](https://www.google.com/search?q=https://playground.walt.id/)**
*Community reference playground (e.g., Walt.id / Sphereon style) used to observe multi-entity issuer-holder-verifier test flows[cite: 19, 20].*

---

## 4. Community & Support

* **[MOSIP Community Forum](https://community.mosip.io/)**
*Discussion forum for MOSIP and Inji integrators, troubleshooting setup issues, and receiving ecosystem advisory announcements.*
* **[Inji Docs Home](https://docs.inji.io/)**
*Central hub for all user guides, developer specifications, release notes, and deployment documentation across the Inji product suite.*