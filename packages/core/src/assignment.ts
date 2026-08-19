import { assignmentKey, hashToBucket } from "./hash";
import type {
  AssignmentResult,
  ExperimentDefinition,
  ResolveOptions,
  VariantMetadata,
} from "./types";
import { validateExperiment } from "./validation";

function validOverride<TVariants extends Record<string, VariantMetadata>>(
  definition: ExperimentDefinition<TVariants>,
  override: string | undefined,
): override is keyof TVariants & string {
  return (
    typeof override === "string" && Object.hasOwn(definition.variants, override)
  );
}

function result<TVariants extends Record<string, VariantMetadata>>(
  definition: ExperimentDefinition<TVariants>,
  variantId: keyof TVariants & string,
  source: AssignmentResult["source"],
  bucket?: number,
): AssignmentResult<keyof TVariants & string> {
  const revision = definition.variants[variantId]?.revision;
  if (!revision) throw new Error(`Variant "${variantId}" has no revision`);
  return {
    experimentId: definition.id,
    variantId,
    variantRevision: revision,
    source,
    ...(bucket === undefined ? {} : { bucket }),
  };
}

export function resolveExperiment<
  TVariants extends Record<string, VariantMetadata>,
>(
  definition: ExperimentDefinition<TVariants>,
  options: ResolveOptions = {},
): AssignmentResult<keyof TVariants & string> {
  try {
    validateExperiment(definition);
  } catch (error) {
    if (options.mode !== "production") throw error;
    return result(definition, definition.defaultVariant, "default");
  }

  const developerOverride = options.developerOverrides?.[definition.id];
  if (validOverride(definition, developerOverride)) {
    return result(definition, developerOverride, "developer-override");
  }
  const qaOverride = options.qaOverrides?.[definition.id];
  if (validOverride(definition, qaOverride)) {
    return result(definition, qaOverride, "qa-override");
  }
  if (!options.subjectId) {
    return result(definition, definition.defaultVariant, "default");
  }

  const bucket = hashToBucket(
    assignmentKey(definition.id, options.subjectId, definition.salt),
  );
  let cumulative = 0;
  const orderedVariants = Object.keys(definition.variants).sort() as Array<
    keyof TVariants & string
  >;
  for (const variantId of orderedVariants) {
    cumulative += definition.allocation[variantId];
    if (bucket < cumulative) {
      return result(definition, variantId, "deterministic", bucket);
    }
  }
  // Floating point boundaries cannot make assignment unsafe.
  return result(definition, definition.defaultVariant, "default");
}
