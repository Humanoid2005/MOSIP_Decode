import type { ProtocolEvent, TestRun } from "../models/playground";
import { walletName } from "./presentation";

type Participant = "P" | "W" | "A" | "I" | "V";
export interface SequenceMessage {
  eventId: string;
  failed: boolean;
}
export interface SequenceDiagram {
  source: string;
  // One entry per Mermaid message, in drawing order, so rendered arrows can be
  // mapped back to the captured event they represent.
  messages: SequenceMessage[];
}

const identifiers =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|req_[\w-]+|[A-Za-z0-9_-]{24,}/g;

// Captured values come from upstream services; keep only characters that
// cannot terminate or reinterpret a Mermaid statement.
function label(value: string): string {
  return (
    value
      .replace(identifiers, "…")
      .replace(/[^\w\s./:()…·,=+?&@'-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 70) || "exchange"
  );
}

function target(endpoint: string): Participant | undefined {
  const host = (() => {
    try {
      return new URL(endpoint).hostname;
    } catch {
      return "";
    }
  })();
  if (host.includes("certify")) return "I";
  if (host.includes("verify")) return "V";
  if (host.includes("keycloak") || endpoint.includes("/realms/")) return "A";
  if (host.includes("mimoto")) return "W";
  return undefined;
}

function path(endpoint: string): string {
  try {
    const { pathname } = new URL(endpoint);
    return pathname
      .replace(/^\/v1\/(certify\/issuance|verify|mimoto)/, "")
      .replace(/^\/auth\/realms\/[^/]+\/protocol\/openid-connect/, "");
  } catch {
    return endpoint;
  }
}

function presentationPhase(event: ProtocolEvent): boolean {
  return (
    target(event.endpoint) === "V" ||
    /presentation|verifier|vp-/i.test(event.title)
  );
}

export function buildSequence(run: TestRun): SequenceDiagram {
  const lines = [
    "sequenceDiagram",
    "  autonumber",
    "  participant P as Playground",
    `  participant W as ${label(walletName(run.wallet))}`,
    "  participant A as Keycloak",
    "  participant I as Inji Certify",
    "  participant V as Inji Verify",
  ];
  const messages: SequenceMessage[] = [];
  let phase: "issuance" | "presentation" | undefined;
  const send = (
    event: ProtocolEvent,
    from: Participant,
    to: Participant,
    request: string,
  ) => {
    const failed = event.status >= 400;
    lines.push(`  ${from}->>+${to}: ${label(request)}`);
    lines.push(
      `  ${to}-${failed ? "-x" : "->>"}-${from}: ${event.status}${
        event.durationMs ? ` · ${Math.round(event.durationMs)} ms` : ""
      }`,
    );
    messages.push({ eventId: event.id, failed }, { eventId: event.id, failed });
  };
  for (const event of run.events) {
    const next = presentationPhase(event) ? "presentation" : "issuance";
    if (next !== phase && (next === "presentation" || !phase)) {
      phase = next;
      lines.push(
        `  Note over P,V: ${
          next === "issuance"
            ? "OpenID4VCI · credential issuance"
            : run.configuration.format === "mso_mdoc"
              ? "Direct mDoc credential check · Inji Verify has no OpenID4VP path for mDoc"
              : "OpenID4VP · presentation and verification"
        }`,
      );
    }
    const to = target(event.endpoint);
    if (event.source === "SCENARIO")
      lines.push(
        "  rect rgba(217, 119, 6, 0.12)",
        `  Note over W,V: ${label(event.title)}`,
        "  end",
      );
    else if (event.source === "PROXY" && to)
      send(
        event,
        "W",
        to,
        `${event.method} ${path(event.endpoint)} via bridge`,
      );
    else if (event.source === "WALLET" && to === "W")
      send(
        event,
        "P",
        "W",
        `Mimoto API ${event.method} ${path(event.endpoint)}`,
      );
    else if (event.source === "HTTP" && to) send(event, "P", to, event.title);
    else lines.push(`  Note over W: ${label(event.title)}`);
  }
  if (!run.events.length)
    lines.push("  Note over P,V: Waiting for the first captured exchange");
  return { source: lines.join("\n"), messages };
}
