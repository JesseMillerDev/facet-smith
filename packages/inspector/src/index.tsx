"use client";

import { applyOverridesToUrl } from "@facet-smith/core";
import {
  useExperimentRegistry,
  type RegisteredExperiment,
} from "@facet-smith/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

interface PositionedRegistration extends RegisteredExperiment {
  readonly rect: DOMRect;
  readonly depth: number;
}

const colors = {
  ink: "#16141f",
  paper: "#ffffff",
  accent: "#7655ff",
  accentDark: "#5035ca",
  muted: "#716d7b",
  border: "#d9d4e7",
};

function visualRect(marker: HTMLElement): DOMRect | null {
  const rectangles: DOMRect[] = [];
  const visit = (element: Element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) rectangles.push(rect);
    else Array.from(element.children).forEach(visit);
  };
  Array.from(marker.children).forEach(visit);
  if (rectangles.length === 0) return null;
  const left = Math.min(...rectangles.map((rect) => rect.left));
  const top = Math.min(...rectangles.map((rect) => rect.top));
  const right = Math.max(...rectangles.map((rect) => rect.right));
  const bottom = Math.max(...rectangles.map((rect) => rect.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

function markerDepth(marker: HTMLElement): number {
  let depth = 0;
  let parent = marker.parentElement?.closest<HTMLElement>(
    "[data-experiment-id]",
  );
  while (parent) {
    depth += 1;
    parent = parent.parentElement?.closest<HTMLElement>("[data-experiment-id]");
  }
  return depth;
}

function usePositions(registrations: readonly RegisteredExperiment[]) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const update = () => setVersion((value) => value + 1);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    for (const registration of registrations) {
      resizeObserver?.observe(registration.marker);
      Array.from(registration.marker.children).forEach((child) =>
        resizeObserver?.observe(child),
      );
    }
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [registrations]);

  return useMemo(
    () =>
      registrations.flatMap((registration): PositionedRegistration[] => {
        const rect = visualRect(registration.marker);
        return rect
          ? [{ ...registration, rect, depth: markerDepth(registration.marker) }]
          : [];
      }),
    // The version intentionally recomputes DOM geometry after observer and scroll events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registrations, version],
  );
}

const buttonStyle: CSSProperties = {
  appearance: "none",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: colors.border,
  background: colors.paper,
  color: colors.ink,
  borderRadius: 7,
  padding: "6px 9px",
  font: "600 12px/1.2 system-ui, sans-serif",
  cursor: "pointer",
};

async function copyUrl(
  overrides: Readonly<Record<string, string>>,
): Promise<string> {
  const next = applyOverridesToUrl(window.location.href, overrides).href;
  await navigator.clipboard.writeText(next);
  return next;
}

export function ExperimentInspector() {
  const runtime = useExperimentRegistry();
  const positioned = usePositions(runtime.registrations);
  const [outlines, setOutlines] = useState(true);
  const [activeInstance, setActiveInstance] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  const knownOverrides = useMemo(() => {
    const knownIds = new Set(
      runtime.registrations.map((item) => item.experimentId),
    );
    return Object.fromEntries(
      Object.entries(runtime.overrides).filter(([id]) => knownIds.has(id)),
    );
  }, [runtime.overrides, runtime.registrations]);

  const uniqueExperiments = useMemo(
    () =>
      Array.from(
        new Map(
          runtime.registrations.map((item) => [item.experimentId, item]),
        ).values(),
      ).sort((left, right) =>
        left.experimentId.localeCompare(right.experimentId),
      ),
    [runtime.registrations],
  );

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1800);
  }, []);

  useEffect(() => {
    if (!activeInstance) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveInstance(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeInstance]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-experiment-inspector
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        pointerEvents: "none",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {outlines
        ? positioned.map((item) => {
            const active = activeInstance === item.instanceId;
            const highlighted = highlightId === item.experimentId;
            return (
              <div key={item.instanceId}>
                <div
                  aria-hidden="true"
                  style={{
                    position: "fixed",
                    left: item.rect.left,
                    top: item.rect.top,
                    width: item.rect.width,
                    height: item.rect.height,
                    boxSizing: "border-box",
                    border: `${highlighted ? 3 : 2}px solid ${colors.accent}`,
                    borderRadius: 5,
                    boxShadow: highlighted
                      ? "0 0 0 4px rgb(118 85 255 / 20%)"
                      : "none",
                    pointerEvents: "none",
                  }}
                />
                <button
                  type="button"
                  aria-label={`Inspect ${item.experimentId}, variant ${item.variantId}`}
                  aria-expanded={active}
                  onClick={() =>
                    setActiveInstance(active ? null : item.instanceId)
                  }
                  onFocus={() => setHighlightId(item.experimentId)}
                  onBlur={() => setHighlightId(null)}
                  style={{
                    ...buttonStyle,
                    position: "fixed",
                    left: Math.max(4, item.rect.left + item.depth * 12),
                    top: Math.max(4, item.rect.top - 28 - item.depth * 25),
                    color: colors.paper,
                    background: colors.accentDark,
                    borderColor: colors.accentDark,
                    pointerEvents: "auto",
                    whiteSpace: "nowrap",
                    boxShadow: "0 3px 12px rgb(0 0 0 / 22%)",
                  }}
                >
                  {item.experimentId} · {item.variantId} · r
                  {item.variantRevision}
                </button>
                {active ? (
                  <div
                    ref={popoverRef}
                    role="dialog"
                    aria-label={`Variants for ${item.experimentId}`}
                    style={{
                      position: "fixed",
                      left: Math.min(
                        Math.max(8, item.rect.left),
                        window.innerWidth - 280,
                      ),
                      top: Math.min(
                        item.rect.top + 8,
                        window.innerHeight - 260,
                      ),
                      width: 264,
                      padding: 12,
                      background: colors.paper,
                      color: colors.ink,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 10,
                      boxShadow: "0 14px 40px rgb(24 18 46 / 24%)",
                      zIndex: 1,
                      pointerEvents: "auto",
                    }}
                  >
                    <strong style={{ display: "block", marginBottom: 8 }}>
                      {item.experimentId}
                    </strong>
                    <div style={{ display: "grid", gap: 6 }}>
                      {Object.entries(item.variants).map(
                        ([variantId, revision]) => (
                          <button
                            key={variantId}
                            type="button"
                            aria-pressed={item.variantId === variantId}
                            onClick={() => {
                              void runtime
                                .setOverride(item.experimentId, variantId)
                                .then(() => {
                                  showNotice(`Switched to ${variantId}`);
                                  setActiveInstance(null);
                                })
                                .catch((error: unknown) =>
                                  showNotice(
                                    error instanceof Error
                                      ? error.message
                                      : "Switch failed",
                                  ),
                                );
                            }}
                            style={{
                              ...buttonStyle,
                              textAlign: "left",
                              ...(item.variantId === variantId
                                ? {
                                    borderColor: colors.accent,
                                    background: "#f2efff",
                                  }
                                : {}),
                            }}
                          >
                            {variantId}{" "}
                            <span style={{ color: colors.muted }}>
                              revision {revision}
                            </span>
                          </button>
                        ),
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() => {
                          void runtime
                            .setOverride(item.experimentId, null)
                            .then(() => setActiveInstance(null));
                        }}
                        style={buttonStyle}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void copyUrl({
                            ...knownOverrides,
                            [item.experimentId]: item.variantId,
                          })
                            .then(() => showNotice("Override URL copied"))
                            .catch(() =>
                              showNotice("Clipboard permission denied"),
                            )
                        }
                        style={buttonStyle}
                      >
                        Copy URL
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        : null}

      <aside
        aria-label="FacetSmith toolbar"
        hidden={activeInstance !== null}
        style={{
          position: "fixed",
          right: 12,
          bottom: 12,
          width: 280,
          padding: 12,
          color: colors.ink,
          background: "rgb(255 255 255 / 96%)",
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          boxShadow: "0 14px 40px rgb(24 18 46 / 20%)",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <strong>FacetSmith</strong>
          <button
            type="button"
            aria-pressed={outlines}
            aria-label="Toggle experiment outlines"
            onClick={() => setOutlines((value) => !value)}
            style={buttonStyle}
          >
            {outlines ? "Hide" : "Show"} outlines
          </button>
        </div>
        <p style={{ margin: "8px 0", color: colors.muted, fontSize: 12 }}>
          {uniqueExperiments.length} mounted experiment
          {uniqueExperiments.length === 1 ? "" : "s"}
        </p>
        <div
          aria-label="Mounted experiments"
          style={{ display: "grid", gap: 5 }}
        >
          {uniqueExperiments.map((item) => (
            <button
              key={item.experimentId}
              type="button"
              onMouseEnter={() => setHighlightId(item.experimentId)}
              onMouseLeave={() => setHighlightId(null)}
              onFocus={() => setHighlightId(item.experimentId)}
              onBlur={() => setHighlightId(null)}
              onClick={() => setActiveInstance(item.instanceId)}
              style={{ ...buttonStyle, textAlign: "left" }}
            >
              {item.experimentId}{" "}
              <span style={{ color: colors.muted }}>· {item.variantId}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
          <button
            type="button"
            onClick={() => void runtime.resetAllOverrides()}
            style={buttonStyle}
          >
            Reset all
          </button>
          <button
            type="button"
            onClick={() =>
              void copyUrl(knownOverrides)
                .then(() => showNotice("Override URL copied"))
                .catch(() => showNotice("Clipboard permission denied"))
            }
            style={buttonStyle}
          >
            Copy current URL
          </button>
        </div>
        <div
          aria-live="polite"
          style={{
            minHeight: 16,
            marginTop: 6,
            color: colors.accentDark,
            fontSize: 12,
          }}
        >
          {notice}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

export default ExperimentInspector;
