import { isValidIdentifier } from "./validation";
import type {
  ExperimentDefinition,
  ExperimentOverrides,
  VariantMetadata,
} from "./types";

export const OVERRIDE_QUERY_PARAMETER = "__exp";

export function parseOverrides(
  value: string | null | undefined,
): ExperimentOverrides {
  if (!value) return {};
  const overrides: Record<string, string> = {};
  for (const entry of value.split(",")) {
    const separator = entry.indexOf(":");
    if (separator <= 0 || separator === entry.length - 1) continue;
    let experimentId: string;
    let variantId: string;
    try {
      experimentId = decodeURIComponent(entry.slice(0, separator).trim());
      variantId = decodeURIComponent(entry.slice(separator + 1).trim());
    } catch {
      continue;
    }
    if (isValidIdentifier(experimentId) && isValidIdentifier(variantId)) {
      overrides[experimentId] = variantId;
    }
  }
  return overrides;
}

export function serializeOverrides(overrides: ExperimentOverrides): string {
  return Object.entries(overrides)
    .filter(
      ([experimentId, variantId]) =>
        isValidIdentifier(experimentId) && isValidIdentifier(variantId),
    )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([experimentId, variantId]) =>
        `${encodeURIComponent(experimentId)}:${encodeURIComponent(variantId)}`,
    )
    .join(",");
}

export function overridesFromUrl(url: string | URL): ExperimentOverrides {
  const parsed = typeof url === "string" ? new URL(url) : url;
  return parseOverrides(parsed.searchParams.get(OVERRIDE_QUERY_PARAMETER));
}

export function applyOverridesToUrl(
  url: string | URL,
  overrides: ExperimentOverrides,
): URL {
  const parsed = new URL(url.toString());
  const serialized = serializeOverrides(overrides);
  if (serialized) parsed.searchParams.set(OVERRIDE_QUERY_PARAMETER, serialized);
  else parsed.searchParams.delete(OVERRIDE_QUERY_PARAMETER);
  return parsed;
}

export function sanitizeOverrides(
  overrides: ExperimentOverrides,
  definitions: readonly ExperimentDefinition<Record<string, VariantMetadata>>[],
): ExperimentOverrides {
  const known = new Map(
    definitions.map((definition) => [
      definition.id,
      new Set(Object.keys(definition.variants)),
    ]),
  );
  return Object.fromEntries(
    Object.entries(overrides).filter(([experimentId, variantId]) =>
      known.get(experimentId)?.has(variantId),
    ),
  );
}
