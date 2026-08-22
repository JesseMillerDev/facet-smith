import type {
  AssignmentResolver,
  ExperimentDefinition,
  VariantMetadata,
} from "./types";
import {
  DEFAULT_ASSIGNMENT_RESOLVER_ID,
  ExperimentDefinitionCollisionError,
} from "./types";
import { validateExperiment } from "./validation";

export interface AnyExperimentDefinition {
  readonly id: string;
  readonly iteration: string;
  readonly defaultVariant: string;
  readonly variants: Readonly<Record<string, VariantMetadata>>;
  readonly allocation?: Readonly<Record<string, number>>;
  readonly salt?: string;
  readonly resolverId?: string;
}

/** Stable semantic representation used to compare source definitions. */
export function experimentDefinitionFingerprint(
  definition: AnyExperimentDefinition,
  resolverId = definition.resolverId ?? DEFAULT_ASSIGNMENT_RESOLVER_ID,
): string {
  const variants = Object.fromEntries(
    Object.entries(definition.variants)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, variant]) => [id, { revision: variant.revision }]),
  );
  const allocation =
    definition.allocation === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(definition.allocation).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        );
  return JSON.stringify({
    id: definition.id,
    iteration: definition.iteration,
    defaultVariant: definition.defaultVariant,
    variants,
    allocation,
    salt: definition.salt ?? "",
    resolverId,
  });
}

export interface ExperimentDefinitionRegistry {
  register<TVariants extends Record<string, VariantMetadata>>(
    definition: ExperimentDefinition<TVariants>,
    resolver?: Pick<AssignmentResolver, "id">,
  ): void;
  clear(): void;
}

/** Provider-lifetime collision detection, isolated from global/HMR state. */
export function createExperimentDefinitionRegistry(): ExperimentDefinitionRegistry {
  const fingerprints = new Map<string, string>();
  return {
    register(definition, resolver) {
      validateExperiment(definition, resolver);
      const fingerprint = experimentDefinitionFingerprint(
        definition,
        resolver?.id,
      );
      const existing = fingerprints.get(definition.id);
      if (existing !== undefined && existing !== fingerprint) {
        throw new ExperimentDefinitionCollisionError(definition.id);
      }
      fingerprints.set(definition.id, fingerprint);
    },
    clear() {
      fingerprints.clear();
    },
  };
}

/** Validates a complete manifest and rejects conflicting duplicate IDs. */
export function validateExperimentDefinitions<
  const TDefinitions extends readonly AnyExperimentDefinition[],
>(definitions: TDefinitions): TDefinitions {
  const registry = createExperimentDefinitionRegistry();
  for (const definition of definitions) {
    registry.register(
      definition,
      definition.resolverId === undefined
        ? undefined
        : { id: definition.resolverId },
    );
  }
  return definitions;
}
