import { defaultAssignmentResolver } from "./default-resolver";
import {
  DEFAULT_ASSIGNMENT_RESOLVER_ID,
  type AssignmentDiagnostic,
  type AssignmentResolverResult,
  type AssignmentResult,
  type ExperimentDefinition,
  type ResolveOptions,
  type VariantMetadata,
} from "./types";
import { validateExperiment } from "./validation";

/* eslint-disable no-redeclare -- TypeScript overloads share one implementation. */

export const DEFAULT_ASSIGNMENT_TIMEOUT_MS = 1_000;

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
  resolverId: string,
  details: {
    readonly bucket?: number;
    readonly diagnostics?: readonly AssignmentDiagnostic[];
  } = {},
): AssignmentResult<keyof TVariants & string> {
  const revision = definition.variants[variantId]?.revision;
  if (!revision) throw new Error(`Variant "${variantId}" has no revision`);
  return {
    experimentId: definition.id,
    experimentIteration: definition.iteration,
    variantId,
    variantRevision: revision,
    source,
    resolverId,
    ...(details.bucket === undefined ? {} : { bucket: details.bucket }),
    ...(details.diagnostics === undefined
      ? {}
      : { diagnostics: details.diagnostics }),
  };
}

function diagnostic(code: AssignmentDiagnostic["code"], message: string) {
  return Object.freeze({ code, message });
}

function isPromiseLike(
  value: AssignmentResolverResult | PromiseLike<AssignmentResolverResult>,
): value is PromiseLike<AssignmentResolverResult> {
  return (
    typeof (value as PromiseLike<AssignmentResolverResult>).then === "function"
  );
}

export function resolveExperiment<
  TVariants extends Record<string, VariantMetadata>,
>(
  definition: ExperimentDefinition<TVariants>,
  options?: ResolveOptions & { readonly resolver?: undefined },
): AssignmentResult<keyof TVariants & string>;
export function resolveExperiment<
  TVariants extends Record<string, VariantMetadata>,
>(
  definition: ExperimentDefinition<TVariants>,
  options: ResolveOptions & {
    readonly resolver: NonNullable<ResolveOptions["resolver"]>;
  },
):
  | AssignmentResult<keyof TVariants & string>
  | Promise<AssignmentResult<keyof TVariants & string>>;
export function resolveExperiment<
  TVariants extends Record<string, VariantMetadata>,
>(
  definition: ExperimentDefinition<TVariants>,
  options: ResolveOptions = {},
):
  | AssignmentResult<keyof TVariants & string>
  | Promise<AssignmentResult<keyof TVariants & string>> {
  const resolver = options.resolver ?? defaultAssignmentResolver;
  validateExperiment(definition, resolver);

  const developerOverride = options.developerOverrides?.[definition.id];
  if (validOverride(definition, developerOverride)) {
    return result(
      definition,
      developerOverride,
      "developer-override",
      resolver.id,
    );
  }
  const qaOverride = options.qaOverrides?.[definition.id];
  if (validOverride(definition, qaOverride)) {
    return result(definition, qaOverride, "qa-override", resolver.id);
  }
  if (!options.subjectId) {
    return result(
      definition,
      definition.defaultVariant,
      "default",
      resolver.id,
    );
  }

  const variantIds = Object.keys(definition.variants) as Array<
    keyof TVariants & string
  >;
  const controller = new AbortController();
  const request = {
    experimentId: definition.id,
    iteration: definition.iteration,
    variantIds,
    ...(definition.allocation === undefined
      ? {}
      : { allocation: definition.allocation }),
    defaultVariant: definition.defaultVariant,
    subjectId: options.subjectId,
    ...(options.attributes === undefined
      ? {}
      : { attributes: options.attributes }),
    ...(definition.salt === undefined ? {} : { salt: definition.salt }),
    signal: controller.signal,
  };
  const fallback = (
    code: AssignmentDiagnostic["code"],
    message: string,
    diagnostics: readonly AssignmentDiagnostic[] = [],
  ) =>
    result(definition, definition.defaultVariant, "default", resolver.id, {
      diagnostics: [...diagnostics, diagnostic(code, message)],
    });
  const accept = (resolved: AssignmentResolverResult) => {
    const resolverDiagnostics = Array.isArray(resolved?.diagnostics)
      ? resolved.diagnostics
      : [];
    const resolvedVariant = resolved?.variantId;
    if (!validOverride(definition, resolvedVariant)) {
      return fallback(
        "FS200",
        `Assignment resolver "${resolver.id}" returned undeclared variant "${String(resolvedVariant)}" for experiment "${definition.id}".`,
        resolverDiagnostics,
      );
    }
    return result(
      definition,
      resolved.variantId,
      resolver.id === DEFAULT_ASSIGNMENT_RESOLVER_ID
        ? resolved.bucket === undefined
          ? "default"
          : "deterministic"
        : "resolver",
      resolver.id,
      {
        ...(resolved.bucket === undefined ? {} : { bucket: resolved.bucket }),
        ...(resolverDiagnostics.length === 0
          ? {}
          : { diagnostics: resolverDiagnostics }),
      },
    );
  };

  let resolution:
    | AssignmentResolverResult
    | PromiseLike<AssignmentResolverResult>;
  try {
    resolution = resolver.resolve(request);
    if (!isPromiseLike(resolution)) return accept(resolution);
  } catch (error) {
    return fallback(
      "FS201",
      `Assignment resolver "${resolver.id}" threw for experiment "${definition.id}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const configuredTimeout = options.timeoutMs ?? DEFAULT_ASSIGNMENT_TIMEOUT_MS;
  const timeoutMs =
    Number.isFinite(configuredTimeout) && configuredTimeout >= 0
      ? configuredTimeout
      : DEFAULT_ASSIGNMENT_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof globalThis.setTimeout>;
    const finish = (assignment: AssignmentResult<keyof TVariants & string>) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      resolve(assignment);
    };
    timer = globalThis.setTimeout(() => {
      controller.abort();
      finish(
        fallback(
          "FS202",
          `Assignment resolver "${resolver.id}" exceeded ${timeoutMs}ms for experiment "${definition.id}".`,
        ),
      );
    }, timeoutMs);
    void Promise.resolve(resolution).then(
      (resolved) => {
        try {
          finish(accept(resolved));
        } catch (error) {
          finish(
            fallback(
              "FS201",
              `Assignment resolver "${resolver.id}" produced an unreadable result for experiment "${definition.id}": ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      },
      (error: unknown) =>
        finish(
          fallback(
            "FS201",
            `Assignment resolver "${resolver.id}" rejected for experiment "${definition.id}": ${error instanceof Error ? error.message : String(error)}`,
          ),
        ),
    );
  });
}
