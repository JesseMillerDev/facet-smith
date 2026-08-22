import { assignmentKey, hashToBucket } from "./hash";
import {
  DEFAULT_ASSIGNMENT_RESOLVER_ID,
  type AssignmentResolver,
  type AssignmentRequest,
  type AssignmentResolverResult,
} from "./types";

/** The original FacetSmith FNV-1a assignment implementation. */
export const defaultAssignmentResolver = Object.freeze({
  id: DEFAULT_ASSIGNMENT_RESOLVER_ID,
  resolve(request: AssignmentRequest) {
    if (!request.allocation) {
      throw new Error(
        `Resolver "${DEFAULT_ASSIGNMENT_RESOLVER_ID}" requires source allocation`,
      );
    }
    const bucket = hashToBucket(
      assignmentKey(
        request.experimentId,
        request.subjectId,
        request.salt,
        request.iteration,
      ),
    );
    let cumulative = 0;
    const orderedVariants = [...request.variantIds].sort();
    for (const variantId of orderedVariants) {
      cumulative += request.allocation[variantId] ?? 0;
      if (bucket < cumulative) return { variantId, bucket };
    }
    return { variantId: request.defaultVariant };
  },
} satisfies AssignmentResolver<AssignmentResolverResult>);
