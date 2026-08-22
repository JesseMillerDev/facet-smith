export type VariantId = string;

export interface VariantMetadata {
  readonly revision: string;
}

export interface ExperimentDefinition<
  TVariants extends Record<string, VariantMetadata> = Record<
    string,
    VariantMetadata
  >,
> {
  readonly id: string;
  /** Immutable identity for one experimental run. Change it when assignment semantics change. */
  readonly iteration: string;
  readonly defaultVariant: keyof TVariants & string;
  readonly variants: TVariants;
  readonly allocation?: { readonly [K in keyof TVariants]: number };
  readonly salt?: string;
}

export type Allocation<TVariant extends string = string> = Readonly<
  Record<TVariant, number>
>;

export type AssignmentDiagnosticCode = "FS200" | "FS201" | "FS202";

export interface AssignmentDiagnostic {
  readonly code: AssignmentDiagnosticCode | (string & {});
  readonly message: string;
}

export interface AssignmentRequest<TVariant extends string = string> {
  readonly experimentId: string;
  readonly iteration: string;
  readonly variantIds: readonly TVariant[];
  readonly allocation?: Allocation<TVariant>;
  readonly defaultVariant: TVariant;
  /** Always present because FacetSmith handles missing subjects before invoking a resolver. */
  readonly subjectId: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  /** Preserves the default resolver's existing assignment framing. */
  readonly salt?: string;
  /** Aborted when FacetSmith's resolver timeout elapses. */
  readonly signal: AbortSignal;
}

export interface AssignmentResolverResult<TVariant extends string = string> {
  readonly variantId: TVariant;
  readonly bucket?: number;
  readonly diagnostics?: readonly AssignmentDiagnostic[];
}

export interface AssignmentResolver<
  TResult extends
    | AssignmentResolverResult
    | PromiseLike<AssignmentResolverResult> =
    | AssignmentResolverResult
    | PromiseLike<AssignmentResolverResult>,
> {
  readonly id: string;
  resolve(request: AssignmentRequest): TResult;
}

export const DEFAULT_ASSIGNMENT_RESOLVER_ID = "facetsmith-fnv1a";

export type AssignmentSource =
  | "developer-override"
  | "qa-override"
  | "deterministic"
  | "resolver"
  | "default";

export interface AssignmentResult<TVariant extends string = string> {
  readonly experimentId: string;
  readonly experimentIteration: string;
  readonly variantId: TVariant;
  readonly variantRevision: string;
  readonly source: AssignmentSource;
  /** Always populated by FacetSmith; optional for legacy pre-resolved assignments. */
  readonly resolverId?: string;
  readonly diagnostics?: readonly AssignmentDiagnostic[];
  readonly bucket?: number;
}

export type ExperimentOverrides = Readonly<Record<string, string>>;

export interface ResolveOptions {
  readonly subjectId?: string | null;
  readonly developerOverrides?: ExperimentOverrides;
  readonly qaOverrides?: ExperimentOverrides;
  readonly resolver?: AssignmentResolver;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly timeoutMs?: number;
  /** Defaults to development outside a browser build. */
  readonly mode?: "development" | "production";
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export class ExperimentValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(experimentId: string, issues: readonly ValidationIssue[]) {
    super(
      `Invalid experiment "${experimentId}": ${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "ExperimentValidationError";
    this.issues = issues;
  }
}

export class ExperimentDefinitionCollisionError extends Error {
  readonly experimentId: string;

  constructor(experimentId: string) {
    super(
      `Conflicting definitions use experiment ID "${experimentId}". Experiment IDs must identify one definition within a runtime or manifest.`,
    );
    this.name = "ExperimentDefinitionCollisionError";
    this.experimentId = experimentId;
  }
}
