import type { AssignmentResolver } from "@facet-smith/core";

interface ExternalAssignmentResponse {
  readonly variantId: string;
}

/** Example adapter around an application-owned flag endpoint. */
export const externalServiceResolver = {
  id: "example-external-service",
  async resolve(request) {
    const response = await fetch("https://flags.example.test/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        flag: `${request.experimentId}.${request.iteration}`,
        subjectId: request.subjectId,
        attributes: request.attributes,
      }),
      signal: request.signal,
    });
    if (!response.ok)
      throw new Error(`Flag service returned ${response.status}`);
    const assignment = (await response.json()) as ExternalAssignmentResponse;
    return { variantId: assignment.variantId };
  },
} as const satisfies AssignmentResolver;
