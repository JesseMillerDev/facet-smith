import type {
  FeatureApiResponse,
  FeatureResult,
  GrowthBookClient,
  StickyBucketService,
  UserContext,
} from "@growthbook/growthbook";
import type {
  AssignmentDiagnostic,
  AssignmentRequest,
  AssignmentResolver,
  AssignmentResolverResult,
} from "@facet-smith/core";

export const GROWTHBOOK_ASSIGNMENT_RESOLVER_ID =
  "facetsmith-growthbook-server-v1";

export const GROWTHBOOK_DIAGNOSTIC_CODES = Object.freeze({
  unknownFeature: "FSGB100",
  defaultValue: "FSGB101",
  forcedValue: "FSGB102",
  overriddenValue: "FSGB103",
  prerequisiteFailed: "FSGB104",
  cyclicPrerequisite: "FSGB105",
  unsafeExperimentKey: "FSGB106",
  forcedVariation: "FSGB107",
  invalidExperimentResult: "FSGB108",
} as const);

export interface GrowthBookResolverOptions<
  AppFeatures extends Record<string, unknown> = Record<string, unknown>,
> {
  /** An initialized singleton GrowthBookClient. Do not configure its tracking callback. */
  readonly client: GrowthBookClient<AppFeatures>;
  /** GrowthBook attribute used for FacetSmith's stable subject. Defaults to `id`. */
  readonly subjectAttribute?: string;
  /** Namespace for generated iteration-scoped GrowthBook keys. */
  readonly keyPrefix?: string;
  /** Optional server-side sticky storage. Resolution becomes async when supplied. */
  readonly stickyBucketService?: StickyBucketService;
}

export interface GrowthBookAssignmentResolver extends AssignmentResolver {
  readonly id: typeof GROWTHBOOK_ASSIGNMENT_RESOLVER_ID;
}

function diagnostic(code: string, message: string): AssignmentDiagnostic {
  return Object.freeze({ code, message });
}

/**
 * Generates the only GrowthBook feature and experiment key accepted by the
 * adapter. Iteration is embedded so sticky assignments cannot cross runs.
 */
export function growthBookIterationKey(
  experimentId: string,
  iteration: string,
  prefix = "facetsmith",
): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(prefix)) {
    throw new Error("GrowthBook key prefix must be URL-safe");
  }
  return `${prefix}-${experimentId.length}-${experimentId}-${iteration.length}-${iteration}`;
}

function experimentRuleKeyMismatch(
  payload: FeatureApiResponse,
  featureKey: string,
): string | undefined {
  const feature = payload.features?.[featureKey];
  for (const rule of feature?.rules ?? []) {
    const variations = rule.contextualVariations ?? rule.variations;
    if (!variations) continue;
    const experimentKey = rule.key ?? featureKey;
    if (experimentKey !== featureKey) return experimentKey;
  }
  return undefined;
}

function sourceVariant(value: unknown, defaultVariant: string): string {
  return typeof value === "string" ? value : defaultVariant;
}

function ineligible(
  request: AssignmentRequest,
  result: FeatureResult<unknown>,
): AssignmentResolverResult {
  const variantId = sourceVariant(result.value, request.defaultVariant);
  switch (result.source) {
    case "unknownFeature":
      return {
        decision: "ineligible",
        variantId,
        diagnostics: [
          diagnostic(
            GROWTHBOOK_DIAGNOSTIC_CODES.unknownFeature,
            `GrowthBook feature for experiment "${request.experimentId}" is unknown.`,
          ),
        ],
      };
    case "force":
      return {
        decision: "ineligible",
        variantId,
        diagnostics: [
          diagnostic(
            GROWTHBOOK_DIAGNOSTIC_CODES.forcedValue,
            `GrowthBook forced a feature value for experiment "${request.experimentId}"; the value is rendered without exposure.`,
          ),
        ],
      };
    case "override":
      return {
        decision: "ineligible",
        variantId,
        diagnostics: [
          diagnostic(
            GROWTHBOOK_DIAGNOSTIC_CODES.overriddenValue,
            `GrowthBook overrode the feature value for experiment "${request.experimentId}"; the value is rendered without exposure.`,
          ),
        ],
      };
    case "prerequisite":
      return {
        decision: "ineligible",
        variantId,
        diagnostics: [
          diagnostic(
            GROWTHBOOK_DIAGNOSTIC_CODES.prerequisiteFailed,
            `GrowthBook blocked experiment "${request.experimentId}" on a prerequisite.`,
          ),
        ],
      };
    case "cyclicPrerequisite":
      return {
        decision: "ineligible",
        variantId,
        diagnostics: [
          diagnostic(
            GROWTHBOOK_DIAGNOSTIC_CODES.cyclicPrerequisite,
            `GrowthBook found a cyclic prerequisite for experiment "${request.experimentId}".`,
          ),
        ],
      };
    case "defaultValue":
    default:
      return {
        decision: "ineligible",
        variantId,
        diagnostics: [
          diagnostic(
            GROWTHBOOK_DIAGNOSTIC_CODES.defaultValue,
            `GrowthBook returned the default feature value for experiment "${request.experimentId}". Its public result does not distinguish targeting mismatch from coverage exclusion.`,
          ),
        ],
      };
  }
}

function evaluate<AppFeatures extends Record<string, unknown>>(
  client: GrowthBookClient<AppFeatures>,
  request: AssignmentRequest,
  featureKey: string,
  userContext: UserContext,
): AssignmentResolverResult {
  const unsafeKey = experimentRuleKeyMismatch(
    client.getDecryptedPayload(),
    featureKey,
  );
  if (unsafeKey !== undefined) {
    return {
      decision: "ineligible",
      variantId: request.defaultVariant,
      diagnostics: [
        diagnostic(
          GROWTHBOOK_DIAGNOSTIC_CODES.unsafeExperimentKey,
          `GrowthBook experiment key "${unsafeKey}" does not match iteration-scoped feature key "${featureKey}". Sticky bucketing is unsafe, so FacetSmith refused assignment.`,
        ),
      ],
    };
  }

  const result = client.evalFeature(
    featureKey as string & keyof AppFeatures,
    userContext,
  ) as FeatureResult<unknown>;
  if (result.source !== "experiment") return ineligible(request, result);
  if (!result.experimentResult?.inExperiment) {
    return {
      decision: "ineligible",
      variantId: sourceVariant(result.value, request.defaultVariant),
      diagnostics: [
        diagnostic(
          GROWTHBOOK_DIAGNOSTIC_CODES.invalidExperimentResult,
          `GrowthBook returned an experiment result that did not assign experiment "${request.experimentId}".`,
        ),
      ],
    };
  }
  if (!result.experimentResult.hashUsed) {
    return {
      decision: "ineligible",
      variantId: sourceVariant(result.value, request.defaultVariant),
      diagnostics: [
        diagnostic(
          GROWTHBOOK_DIAGNOSTIC_CODES.forcedVariation,
          `GrowthBook forced an experiment variation for "${request.experimentId}"; the value is rendered without exposure.`,
        ),
      ],
    };
  }
  return {
    decision: "assigned",
    variantId: sourceVariant(result.value, request.defaultVariant),
    ...(result.experimentResult.bucket === undefined
      ? {}
      : { bucket: result.experimentResult.bucket }),
  };
}

/**
 * Creates a resolver for Next.js or other server rendering. Initialize the
 * GrowthBook client before render; this adapter performs no feature fetches.
 */
export function createGrowthBookResolver<
  AppFeatures extends Record<string, unknown> = Record<string, unknown>,
>({
  client,
  subjectAttribute = "id",
  keyPrefix = "facetsmith",
  stickyBucketService,
}: GrowthBookResolverOptions<AppFeatures>): GrowthBookAssignmentResolver {
  return Object.freeze({
    id: GROWTHBOOK_ASSIGNMENT_RESOLVER_ID,
    resolve(request: AssignmentRequest) {
      const featureKey = growthBookIterationKey(
        request.experimentId,
        request.iteration,
        keyPrefix,
      );
      const userContext: UserContext = {
        attributes: {
          ...request.attributes,
          [subjectAttribute]: request.subjectId,
        },
      };
      if (!stickyBucketService) {
        return evaluate(client, request, featureKey, userContext);
      }
      return client
        .applyStickyBuckets(userContext, stickyBucketService)
        .then((stickyContext) =>
          evaluate(client, request, featureKey, stickyContext),
        );
    },
  });
}
