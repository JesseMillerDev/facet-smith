import {
  GrowthBookClient,
  StickyBucketService,
  type FeatureDefinition,
  type StickyAssignmentsDocument,
} from "@growthbook/growthbook";
import { describe, expect, it } from "vitest";
import { resolveExperiment, type AssignmentRequest } from "@facet-smith/core";
import {
  GROWTHBOOK_ASSIGNMENT_RESOLVER_ID,
  GROWTHBOOK_DIAGNOSTIC_CODES,
  createGrowthBookResolver,
  growthBookIterationKey,
} from "../src";

function request(
  overrides: Partial<AssignmentRequest> = {},
): AssignmentRequest {
  return {
    experimentId: "pricing-hero",
    iteration: "launch-1",
    variantIds: ["control", "treatment"],
    defaultVariant: "control",
    subjectId: "subject-1",
    signal: new AbortController().signal,
    ...overrides,
  };
}

function clientWithFeature(
  feature: FeatureDefinition,
  key = growthBookIterationKey("pricing-hero", "launch-1"),
) {
  return new GrowthBookClient().initSync({
    payload: { features: { [key]: feature } },
  });
}

class MemoryStickyBucketService extends StickyBucketService {
  readonly documents = new Map<string, StickyAssignmentsDocument>();

  async getAssignments(attributeName: string, attributeValue: string) {
    return (
      this.documents.get(this.getKey(attributeName, attributeValue)) ?? null
    );
  }

  async saveAssignments(document: StickyAssignmentsDocument) {
    this.documents.set(
      this.getKey(document.attributeName, document.attributeValue),
      document,
    );
  }
}

describe("GrowthBook resolver", () => {
  it("evaluates a real server SDK payload with an iteration-scoped key", () => {
    const key = growthBookIterationKey("pricing-hero", "launch-1");
    expect(key).toBe("facetsmith-12-pricing-hero-8-launch-1");
    const client = clientWithFeature({
      defaultValue: "control",
      rules: [
        {
          key,
          variations: ["control", "treatment"],
          weights: [0, 1],
          hashVersion: 2,
        },
      ],
    });
    const resolver = createGrowthBookResolver({ client });

    expect(resolver.resolve(request())).toMatchObject({
      decision: "assigned",
      variantId: "treatment",
    });
    expect(resolver.id).toBe(GROWTHBOOK_ASSIGNMENT_RESOLVER_ID);
  });

  it("rejects a key prefix that GrowthBook cannot safely address", () => {
    expect(() =>
      growthBookIterationKey("pricing-hero", "launch-1", "unsafe prefix"),
    ).toThrow(/prefix must be URL-safe/);
  });

  it("renders forced values without treating them as experiment exposure", () => {
    const client = clientWithFeature({
      defaultValue: "control",
      rules: [{ force: "treatment" }],
    });
    const result = createGrowthBookResolver({ client }).resolve(request());

    expect(result).toMatchObject({
      decision: "ineligible",
      variantId: "treatment",
      diagnostics: [{ code: GROWTHBOOK_DIAGNOSTIC_CODES.forcedValue }],
    });
  });

  it("reports the SDK's combined targeting-or-coverage default reason", () => {
    const key = growthBookIterationKey("pricing-hero", "launch-1");
    const client = clientWithFeature({
      defaultValue: "control",
      rules: [
        {
          key,
          variations: ["control", "treatment"],
          condition: { plan: "pro" },
        },
      ],
    });
    const result = createGrowthBookResolver({ client }).resolve(
      request({ attributes: { plan: "free" } }),
    );

    expect(result).toMatchObject({
      decision: "ineligible",
      variantId: "control",
      diagnostics: [{ code: GROWTHBOOK_DIAGNOSTIC_CODES.defaultValue }],
    });
  });

  it("refuses a GrowthBook experiment key that can cross iterations", () => {
    const client = clientWithFeature({
      defaultValue: "control",
      rules: [
        {
          key: "pricing-hero",
          variations: ["control", "treatment"],
        },
      ],
    });
    const result = createGrowthBookResolver({ client }).resolve(request());

    expect(result).toMatchObject({
      decision: "ineligible",
      variantId: "control",
      diagnostics: [{ code: GROWTHBOOK_DIAGNOSTIC_CODES.unsafeExperimentKey }],
    });
  });

  it("uses the FacetSmith subject as the first-party GrowthBook identity", () => {
    const key = growthBookIterationKey("pricing-hero", "launch-1");
    const client = clientWithFeature({
      defaultValue: "control",
      rules: [
        {
          key,
          variations: ["control", "treatment"],
          condition: { anonymousId: "anonymous-cookie-1" },
          hashAttribute: "anonymousId",
          weights: [0, 1],
        },
      ],
    });
    const resolver = createGrowthBookResolver({
      client,
      subjectAttribute: "anonymousId",
    });

    expect(
      resolver.resolve(request({ subjectId: "anonymous-cookie-1" })),
    ).toMatchObject({ decision: "assigned", variantId: "treatment" });
  });

  it("keeps sticky assignments isolated by FacetSmith iteration", async () => {
    const firstKey = growthBookIterationKey("pricing-hero", "launch-1");
    const secondKey = growthBookIterationKey("pricing-hero", "launch-2");
    const meta = [{ key: "control" }, { key: "treatment" }];
    const client = new GrowthBookClient().initSync({
      payload: {
        features: {
          [firstKey]: {
            defaultValue: "control",
            rules: [
              {
                key: firstKey,
                variations: ["control", "treatment"],
                weights: [1, 0],
                meta,
                hashVersion: 2,
              },
            ],
          },
          [secondKey]: {
            defaultValue: "control",
            rules: [
              {
                key: secondKey,
                variations: ["control", "treatment"],
                weights: [0, 1],
                meta,
                hashVersion: 2,
              },
            ],
          },
        },
      },
    });
    const stickyBucketService = new MemoryStickyBucketService();
    const resolver = createGrowthBookResolver({
      client,
      stickyBucketService,
    });
    const definition = {
      id: "pricing-hero",
      iteration: "launch-1",
      defaultVariant: "control",
      variants: {
        control: { revision: "1" },
        treatment: { revision: "1" },
      },
    } as const;

    await expect(
      resolveExperiment(definition, { subjectId: "subject-1", resolver }),
    ).resolves.toMatchObject({ variantId: "control", source: "resolver" });
    await expect(
      resolveExperiment(
        { ...definition, iteration: "launch-2" },
        { subjectId: "subject-1", resolver },
      ),
    ).resolves.toMatchObject({ variantId: "treatment", source: "resolver" });

    const assignments = Array.from(
      stickyBucketService.documents.values(),
    ).flatMap((document) => Object.keys(document.assignments));
    expect(assignments).toContain(`${firstKey}__0`);
    expect(assignments).toContain(`${secondKey}__0`);
  });
});
