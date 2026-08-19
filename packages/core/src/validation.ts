import type {
  ExperimentDefinition,
  ValidationIssue,
  VariantMetadata,
} from "./types";
import { ExperimentValidationError } from "./types";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const REVISION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SUM_TOLERANCE = 1e-9;

export function isValidIdentifier(value: string): boolean {
  return ID_PATTERN.test(value);
}

export function isValidRevision(value: string): boolean {
  return REVISION_PATTERN.test(value);
}

export function getExperimentValidationIssues<
  TVariants extends Record<string, VariantMetadata>,
>(definition: ExperimentDefinition<TVariants>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isValidIdentifier(definition.id)) {
    issues.push({ path: "id", message: "must be 1-128 URL-safe characters" });
  }

  const variantIds = Object.keys(definition.variants);
  if (variantIds.length === 0) {
    issues.push({
      path: "variants",
      message: "must contain at least one variant",
    });
  }
  for (const variantId of variantIds) {
    if (!isValidIdentifier(variantId)) {
      issues.push({
        path: `variants.${variantId}`,
        message: "variant ID must be URL-safe",
      });
    }
    const revision = definition.variants[variantId]?.revision;
    if (typeof revision !== "string" || !isValidRevision(revision)) {
      issues.push({
        path: `variants.${variantId}.revision`,
        message: "must be a non-empty URL-safe immutable revision",
      });
    }
  }

  if (!variantIds.includes(definition.defaultVariant)) {
    issues.push({
      path: "defaultVariant",
      message: "must name a known variant",
    });
  }

  const allocationKeys = Object.keys(definition.allocation);
  for (const key of allocationKeys) {
    if (!variantIds.includes(key)) {
      issues.push({ path: `allocation.${key}`, message: "unknown variant" });
    }
    const weight = definition.allocation[key];
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
      issues.push({
        path: `allocation.${key}`,
        message: "must be a finite non-negative number",
      });
    }
  }
  for (const variantId of variantIds) {
    if (
      !Object.prototype.hasOwnProperty.call(definition.allocation, variantId)
    ) {
      issues.push({
        path: `allocation.${variantId}`,
        message: "missing allocation",
      });
    }
  }
  const sum = allocationKeys.reduce(
    (total, key) => total + (definition.allocation[key] ?? 0),
    0,
  );
  if (Math.abs(sum - 1) > SUM_TOLERANCE) {
    issues.push({ path: "allocation", message: "weights must sum to 1" });
  }
  return issues;
}

export function validateExperiment<
  TVariants extends Record<string, VariantMetadata>,
>(
  definition: ExperimentDefinition<TVariants>,
): ExperimentDefinition<TVariants> {
  const issues = getExperimentValidationIssues(definition);
  if (issues.length > 0) {
    throw new ExperimentValidationError(definition.id, issues);
  }
  return definition;
}

export function defineExperiment<
  const TVariants extends Record<string, VariantMetadata>,
>(
  definition: ExperimentDefinition<TVariants>,
): ExperimentDefinition<TVariants> {
  return validateExperiment(definition);
}
