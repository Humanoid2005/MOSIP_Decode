import type { Mermaid } from "mermaid";

let loader: Promise<Mermaid> | undefined;
let renders = 0;

// Mermaid is large; load it only when a diagram is first opened.
function load(): Promise<Mermaid> {
  loader ??= import("mermaid").then(({ default: mermaid }) => {
    // Labels carry text from captured traffic, so Mermaid runs at its strict
    // security level. The theme follows the app's teal and slate palette.
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: {
        fontFamily: "inherit",
        fontSize: "13px",
        primaryColor: "#f0fdfa",
        primaryBorderColor: "#0f766e",
        primaryTextColor: "#0f172a",
        lineColor: "#475569",
        signalColor: "#334155",
        signalTextColor: "#0f172a",
        noteBkgColor: "#f8fafc",
        noteBorderColor: "#cbd5e1",
        noteTextColor: "#334155",
        activationBkgColor: "#ccfbf1",
        activationBorderColor: "#0f766e",
        sequenceNumberColor: "#ffffff",
      },
      sequence: {
        mirrorActors: false,
        showSequenceNumbers: true,
        actorMargin: 60,
        messageMargin: 30,
        useMaxWidth: false,
      },
    });
    return mermaid;
  });
  return loader;
}

// Renders Mermaid source to an SVG string. Each render gets a new element ID,
// because Mermaid scopes the SVG's styles under that ID.
export async function renderSequence(source: string): Promise<string> {
  const mermaid = await load();
  const { svg } = await mermaid.render(`sequence-${++renders}`, source);
  return svg;
}
