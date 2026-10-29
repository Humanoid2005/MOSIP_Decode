import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { TestRun } from "../../models/playground";
import { buildSequence } from "../../services/sequenceDiagram";
import { renderSequence } from "../../services/mermaid";
import { ErrorNotice } from "../ui";

const messageNodes = (root: HTMLElement) => ({
  texts: [...root.querySelectorAll<SVGTextElement>(".messageText")],
  lines: [
    ...root.querySelectorAll<SVGGeometryElement>(
      ".messageLine0, .messageLine1",
    ),
  ],
});

export function SequenceDiagram({
  run,
  selectedId,
  onSelect,
}: {
  run: TestRun;
  selectedId: string;
  onSelect: (eventId: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  // Messages already on screen; only arrows added after this index animate in.
  const shown = useRef(0);
  const [error, setError] = useState<unknown>(null);
  // Query results keep their identity while unchanged, so polling does not redraw.
  const diagram = useMemo(() => buildSequence(run), [run]);
  const select = useEffectEvent(onSelect);
  const highlight = useEffectEvent((root: HTMLElement) => {
    const { texts, lines } = messageNodes(root);
    texts.forEach((text, index) => {
      const active = diagram.messages[index]?.eventId === selectedId;
      text.classList.toggle("seq-selected", active);
      lines[index]?.classList.toggle("seq-selected", active);
    });
  });

  useEffect(() => {
    const { messages } = diagram;
    let cancelled = false;
    renderSequence(diagram.source)
      .then((svg) => {
        const root = container.current;
        if (cancelled || !root) return;
        root.innerHTML = svg;
        setError(null);
        const { texts, lines } = messageNodes(root);
        const first = shown.current;
        texts.forEach((text, index) => {
          const line = lines[index];
          const message = messages[index];
          const parts = line ? [text, line] : [text];
          // Normalises the draw-in animation; dotted response lines keep their dash pattern.
          if (line?.classList.contains("messageLine0"))
            line.setAttribute("pathLength", "1");
          if (message?.failed)
            parts.forEach((part) => part.classList.add("seq-failed"));
          if (index >= first) {
            const delay = `${Math.min(index - first, 12) * 140}ms`;
            parts.forEach((part) => {
              part.classList.add("seq-new");
              part.style.animationDelay = delay;
            });
          }
          if (index === texts.length - 1)
            parts.forEach((part) => part.classList.add("seq-latest"));
          if (message) {
            text.setAttribute("tabindex", "0");
            text.setAttribute("role", "button");
            parts.forEach((part) => {
              part.classList.add("seq-clickable");
              part.addEventListener("click", () => select(message.eventId));
            });
            text.addEventListener("keydown", (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                select(message.eventId);
              }
            });
          }
        });
        // Follow live arrivals; the first draw plays from the top instead.
        if (first > 0 && texts.length > first)
          texts.at(-1)?.scrollIntoView({
            block: "nearest",
            inline: "nearest",
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          });
        shown.current = texts.length;
        highlight(root);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failure);
      });
    return () => {
      cancelled = true;
    };
  }, [diagram]);

  useEffect(() => {
    if (container.current) highlight(container.current);
  }, [selectedId]);

  return (
    <>
      <ErrorNotice
        error={
          error
            ? "The sequence diagram could not be drawn. The captured exchanges remain available in the protocol inspector."
            : null
        }
      />
      <div
        ref={container}
        className="sequence-diagram"
        aria-label="Protocol sequence diagram"
      />
    </>
  );
}
