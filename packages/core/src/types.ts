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
  readonly allocation: { readonly [K in keyof TVariants]: number };
  readonly salt?: string;
}

export type AssignmentSource =
  | "developer-override"
  | "qa-override"
  | "deterministic"
  | "default";

export interface AssignmentResult<TVariant extends string = string> {
  readonly experimentId: string;
  readonly experimentIteration: string;
  readonly variantId: TVariant;
  readonly variantRevision: string;
  readonly source: AssignmentSource;
  readonly bucket?: number;
}

export type ExperimentOverrides = Readonly<Record<string, string>>;

export interface ResolveOptions {
  readonly subjectId?: string | null;
  readonly developerOverrides?: ExperimentOverrides;
  readonly qaOverrides?: ExperimentOverrides;
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
