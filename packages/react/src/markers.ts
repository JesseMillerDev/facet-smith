import { isValidIdentifier } from "@facet-smith/core";

export const EXPERIMENT_MARKER_ATTRIBUTES = Object.freeze({
  id: "data-experiment-id",
  variant: "data-experiment-variant",
  revision: "data-experiment-revision",
} as const);

/** Returns the inspector-only DOM selector for a validated experiment ID. */
export function experimentMarkerSelector(experimentId: string): string {
  if (!isValidIdentifier(experimentId)) {
    throw new TypeError(`Invalid experiment ID: ${experimentId}`);
  }
  return `[${EXPERIMENT_MARKER_ATTRIBUTES.id}="${experimentId}"]`;
}
