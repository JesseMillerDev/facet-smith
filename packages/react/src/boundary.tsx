"use client";

import type { AssignmentResult } from "@facet-smith/core";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { useExperimentRuntime } from "./context";
import { EXPERIMENT_MARKER_ATTRIBUTES } from "./markers";

export interface ExperimentBoundaryProps {
  readonly assignment: AssignmentResult;
  readonly variants: Readonly<Record<string, string>>;
  readonly renderingMode?: "client" | "server";
  readonly children: ReactNode;
}

function hasDirectText(marker: HTMLElement): boolean {
  return Array.from(marker.childNodes).some(
    (node) =>
      node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
  );
}

function hasRenderedContent(marker: HTMLElement): boolean {
  return marker.children.length > 0 || hasDirectText(marker);
}

export function ExperimentBoundary({
  assignment,
  variants,
  renderingMode = "client",
  children,
}: ExperimentBoundaryProps) {
  const runtime = useExperimentRuntime();
  const markerRef = useRef<HTMLSpanElement>(null);
  const instanceId = useId();
  const inspectorEnabled = runtime?.inspectorEnabled;
  const register = runtime?.register;
  const expose = runtime?.expose;
  const subjectId = runtime?.subjectId;

  useLayoutEffect(() => {
    if (!inspectorEnabled || !register || !markerRef.current) return;
    return register({
      instanceId,
      experimentId: assignment.experimentId,
      experimentIteration: assignment.experimentIteration,
      variantId: assignment.variantId,
      variantRevision: assignment.variantRevision,
      assignment,
      variants,
      marker: markerRef.current,
      renderingMode,
    });
  }, [
    assignment,
    inspectorEnabled,
    instanceId,
    register,
    renderingMode,
    variants,
  ]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!expose || !marker) return;
    let emitted = false;
    const emit = () => {
      if (emitted) return;
      emitted = true;
      expose({
        experimentId: assignment.experimentId,
        experimentIteration: assignment.experimentIteration,
        variantId: assignment.variantId,
        variantRevision: assignment.variantRevision,
        ...(subjectId === undefined ? {} : { subjectId }),
        assignmentSource: assignment.source,
        timestamp: new Date().toISOString(),
        ...(typeof window === "undefined" ? {} : { url: window.location.href }),
      });
    };
    if (typeof IntersectionObserver === "undefined") {
      let fallbackObserver: MutationObserver | undefined;
      const emitWhenRendered = () => {
        if (!hasRenderedContent(marker)) return;
        emit();
        fallbackObserver?.disconnect();
      };
      emitWhenRendered();
      if (emitted || typeof MutationObserver === "undefined") return;
      fallbackObserver = new MutationObserver(emitWhenRendered);
      fallbackObserver.observe(marker, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      return () => fallbackObserver?.disconnect();
    }
    const observed = new Set<Element>();
    let textSentinel: HTMLSpanElement | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some(
            (entry) =>
              observed.has(entry.target) &&
              entry.isIntersecting &&
              entry.intersectionRatio > 0,
          )
        ) {
          emit();
          observer.disconnect();
          mutationObserver?.disconnect();
        }
      },
      { threshold: 0.01 },
    );
    const observeTopLevelElements = () => {
      if (!hasDirectText(marker) && textSentinel) {
        observer.unobserve(textSentinel);
        observed.delete(textSentinel);
        textSentinel.remove();
        textSentinel = undefined;
      }
      if (hasDirectText(marker) && !textSentinel) {
        textSentinel = document.createElement("span");
        textSentinel.ariaHidden = "true";
        Object.assign(textSentinel.style, {
          position: "absolute",
          width: "1px",
          height: "1px",
          pointerEvents: "none",
          opacity: "0",
        });
        marker.prepend(textSentinel);
      }
      for (const target of Array.from(marker.children)) {
        if (observed.has(target)) continue;
        observed.add(target);
        observer.observe(target);
      }
    };
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? undefined
        : new MutationObserver(observeTopLevelElements);
    observeTopLevelElements();
    mutationObserver?.observe(marker, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      mutationObserver?.disconnect();
      textSentinel?.remove();
    };
  }, [assignment, expose, subjectId]);

  const metadata = runtime?.inspectorEnabled
    ? {
        [EXPERIMENT_MARKER_ATTRIBUTES.id]: assignment.experimentId,
        [EXPERIMENT_MARKER_ATTRIBUTES.variant]: assignment.variantId,
        [EXPERIMENT_MARKER_ATTRIBUTES.revision]: assignment.variantRevision,
      }
    : {};

  return (
    <span ref={markerRef} style={{ display: "contents" }} {...metadata}>
      {children}
    </span>
  );
}
