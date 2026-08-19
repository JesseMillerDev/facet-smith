"use client";

import type { AssignmentResult } from "@facetsmith/core";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { useExperimentRuntime } from "./context";

export interface ExperimentBoundaryProps {
  readonly assignment: AssignmentResult;
  readonly variants: Readonly<Record<string, string>>;
  readonly renderingMode?: "client" | "server";
  readonly children: ReactNode;
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
    const target = marker.querySelector<HTMLElement>("*");
    if (!target) return;
    const emit = () =>
      expose({
        experimentId: assignment.experimentId,
        variantId: assignment.variantId,
        variantRevision: assignment.variantRevision,
        ...(subjectId === undefined ? {} : { subjectId }),
        assignmentSource: assignment.source,
        timestamp: new Date().toISOString(),
        ...(typeof window === "undefined" ? {} : { url: window.location.href }),
      });
    if (typeof IntersectionObserver === "undefined") {
      emit();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some(
            (entry) => entry.isIntersecting && entry.intersectionRatio > 0,
          )
        ) {
          emit();
          observer.disconnect();
        }
      },
      { threshold: 0.01 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [assignment, expose, subjectId]);

  const metadata = runtime?.inspectorEnabled
    ? {
        "data-experiment-id": assignment.experimentId,
        "data-experiment-variant": assignment.variantId,
        "data-experiment-revision": assignment.variantRevision,
      }
    : {};

  return (
    <span ref={markerRef} style={{ display: "contents" }} {...metadata}>
      {children}
    </span>
  );
}
