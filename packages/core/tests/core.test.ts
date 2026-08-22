import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ASSIGNMENT_RESOLVER_ID,
  ExperimentValidationError,
  applyOverridesToUrl,
  assignmentKey,
  defineExperiment,
  parseOverrides,
  resolveExperiment,
  serializeOverrides,
  stableHash,
  validateExperimentDefinitions,
  type AssignmentResolver,
} from "../src";

const experiment = defineExperiment({
  id: "pricing-hero",
  iteration: "launch-1",
  defaultVariant: "control",
  variants: {
    control: { revision: "1" },
    concise: { revision: "2" },
    socialProof: { revision: "1" },
  },
  allocation: { control: 0.34, concise: 0.33, socialProof: 0.33 },
  salt: "launch",
});

describe("stable assignment", () => {
  it("is repeatable", () => {
    expect(resolveExperiment(experiment, { subjectId: "subject-42" })).toEqual(
      resolveExperiment(experiment, { subjectId: "subject-42" }),
    );
  });

  it("locks hash and assignment golden vectors", () => {
    const vectors = [
      ["", 2166136261],
      ["FacetSmith", 4290779411],
      ["🚀", 1261604408],
    ] as const;
    for (const [input, expected] of vectors)
      expect(stableHash(input)).toBe(expected);

    expect(assignmentKey("pricing-hero", "subject-42", "launch")).toBe(
      "12:pricing-hero|10:subject-42|6:launch",
    );
    expect(
      resolveExperiment(experiment, { subjectId: "subject-42" }),
    ).toMatchObject({
      experimentIteration: "launch-1",
      variantId: "socialProof",
      variantRevision: "1",
      source: "deterministic",
      bucket: 0.8670612385030836,
      resolverId: DEFAULT_ASSIGNMENT_RESOLVER_ID,
    });

    const assignments = [
      ["subject-42", "socialProof", 0.8670612385030836],
      ["alice", "socialProof", 0.944089466240257],
      ["bob", "concise", 0.06709112389944494],
      ["user-0", "concise", 0.31320009543560445],
      ["user-999", "concise", 0.045014018192887306],
      ["account-123", "concise", 0.28346484969370067],
    ] as const;
    for (const [subjectId, variantId, bucket] of assignments) {
      expect(resolveExperiment(experiment, { subjectId })).toMatchObject({
        variantId,
        bucket,
      });
    }
  });

  it("matches the requested distribution over deterministic subjects", () => {
    const counts = { control: 0, concise: 0, socialProof: 0 };
    for (let index = 0; index < 30_000; index += 1) {
      counts[
        resolveExperiment(experiment, { subjectId: `user-${index}` }).variantId
      ] += 1;
    }
    expect(counts.control / 30_000).toBeCloseTo(0.34, 1);
    expect(counts.concise / 30_000).toBeCloseTo(0.33, 1);
    expect(counts.socialProof / 30_000).toBeCloseTo(0.33, 1);
  });
});

describe("assignment resolvers", () => {
  const resolverOwned = {
    id: "external-service",
    resolve: vi.fn(() => ({ variantId: "concise" })),
  } satisfies AssignmentResolver;
  const definition = {
    id: "resolver-owned",
    iteration: "launch-1",
    defaultVariant: "control",
    variants: {
      control: { revision: "1" },
      concise: { revision: "1" },
    },
  } as const;

  it("keeps synchronous resolvers synchronous and passes opaque targeting", () => {
    const assignment = resolveExperiment(definition, {
      subjectId: "subject-1",
      resolver: resolverOwned,
      attributes: { plan: "pro" },
    });

    expect(assignment).not.toBeInstanceOf(Promise);
    expect(assignment).toMatchObject({
      variantId: "concise",
      source: "resolver",
      resolverId: "external-service",
    });
    expect(resolverOwned.resolve).toHaveBeenLastCalledWith(
      expect.objectContaining({
        experimentId: "resolver-owned",
        iteration: "launch-1",
        subjectId: "subject-1",
        variantIds: ["control", "concise"],
        attributes: { plan: "pro" },
      }),
    );
  });

  it("allows absent allocation only with a non-default resolver", () => {
    expect(() => defineExperiment(definition)).toThrow(
      /required by the default resolver/,
    );
    expect(defineExperiment(definition, resolverOwned)).toBe(definition);
  });

  it("does not invoke a resolver without a stable subject", () => {
    resolverOwned.resolve.mockClear();
    const assignment = resolveExperiment(definition, {
      resolver: resolverOwned,
    });
    expect(assignment).toMatchObject({
      variantId: "control",
      source: "default",
    });
    expect(resolverOwned.resolve).not.toHaveBeenCalled();
  });

  it("keeps overrides above resolver output", () => {
    resolverOwned.resolve.mockClear();
    const assignment = resolveExperiment(definition, {
      subjectId: "subject-1",
      resolver: resolverOwned,
      developerOverrides: { "resolver-owned": "control" },
    });
    expect(assignment).toMatchObject({
      variantId: "control",
      source: "developer-override",
      resolverId: "external-service",
    });
    expect(resolverOwned.resolve).not.toHaveBeenCalled();
  });

  it("rejects undeclared variants with a stable diagnostic", async () => {
    const assignment = await resolveExperiment(definition, {
      subjectId: "subject-1",
      resolver: {
        id: "bad-service",
        resolve: () => ({ variantId: "remote-only" }),
      },
    });
    expect(assignment).toMatchObject({
      variantId: "control",
      source: "default",
      diagnostics: [{ code: "FS200" }],
    });
  });

  it("contains throws and rejected promises", async () => {
    const thrown = resolveExperiment(definition, {
      subjectId: "subject-1",
      resolver: {
        id: "throwing-service",
        resolve: () => {
          throw new Error("offline");
        },
      },
    });
    expect(thrown).toMatchObject({
      source: "default",
      diagnostics: [{ code: "FS201" }],
    });

    await expect(
      resolveExperiment(definition, {
        subjectId: "subject-1",
        resolver: {
          id: "rejecting-service",
          resolve: () => Promise.reject(new Error("offline")),
        },
      }),
    ).resolves.toMatchObject({
      source: "default",
      diagnostics: [{ code: "FS201" }],
    });
  });

  it("times out and aborts asynchronous resolvers", async () => {
    let signal: AbortSignal | undefined;
    const assignment = await resolveExperiment(definition, {
      subjectId: "subject-1",
      resolver: {
        id: "slow-service",
        resolve: (request) => {
          signal = request.signal;
          return new Promise(() => undefined);
        },
      },
      timeoutMs: 1,
    });
    expect(assignment).toMatchObject({
      source: "default",
      diagnostics: [{ code: "FS202" }],
    });
    expect(signal?.aborted).toBe(true);
  });
});

describe("validation and resolution", () => {
  it.each([undefined, null, 123])(
    "rejects a non-string iteration at runtime: %s",
    (iteration) => {
      expect(() =>
        defineExperiment({
          ...experiment,
          iteration: iteration as unknown as string,
        }),
      ).toThrow(ExperimentValidationError);
    },
  );

  it.each([
    [{ control: -1, concise: 1, socialProof: 1 }],
    [{ control: 0.5, concise: 0.5 }],
    [{ control: 0.3, concise: 0.3, socialProof: 0.3 }],
    [{ control: 0.3, concise: 0.3, socialProof: 0.3, ghost: 0.1 }],
  ])("rejects invalid allocation %o", (allocation) => {
    expect(() =>
      defineExperiment({
        ...experiment,
        allocation: allocation as unknown as NonNullable<
          typeof experiment.allocation
        >,
      }),
    ).toThrow(ExperimentValidationError);
  });

  it("uses developer, QA, deterministic, then default precedence", () => {
    expect(
      resolveExperiment(experiment, {
        subjectId: "subject-42",
        developerOverrides: { "pricing-hero": "concise" },
        qaOverrides: { "pricing-hero": "control" },
      }).source,
    ).toBe("developer-override");
    expect(
      resolveExperiment(experiment, {
        subjectId: "subject-42",
        developerOverrides: { "pricing-hero": "unknown" },
        qaOverrides: { "pricing-hero": "control" },
      }).source,
    ).toBe("qa-override");
    expect(
      resolveExperiment(experiment, { subjectId: "subject-42" }).source,
    ).toBe("deterministic");
    expect(resolveExperiment(experiment).source).toBe("default");
  });

  it("treats an iteration change as a new assignment identity", () => {
    const nextIteration = defineExperiment({
      ...experiment,
      iteration: "launch-2",
    });
    const first = resolveExperiment(experiment, { subjectId: "subject-42" });
    const second = resolveExperiment(nextIteration, {
      subjectId: "subject-42",
    });

    expect(first.experimentIteration).toBe("launch-1");
    expect(second.experimentIteration).toBe("launch-2");
    expect(second.bucket).not.toBe(first.bucket);
  });

  it("rejects conflicting duplicate experiment IDs in a manifest", () => {
    expect(() =>
      validateExperimentDefinitions([
        experiment,
        { ...experiment, iteration: "launch-2" },
      ]),
    ).toThrow(/Conflicting definitions use experiment ID/);

    expect(
      validateExperimentDefinitions([experiment, experiment]),
    ).toHaveLength(2);
  });

  it("fails fast for an invalid source definition in every mode", () => {
    const invalid = {
      ...experiment,
      allocation: { control: 1 } as unknown as NonNullable<
        typeof experiment.allocation
      >,
    };
    expect(() => resolveExperiment(invalid)).toThrow(ExperimentValidationError);
    expect(() => resolveExperiment(invalid, { mode: "production" })).toThrow(
      ExperimentValidationError,
    );
  });
});

describe("overrides", () => {
  it("round trips in stable order with URL encoding", () => {
    const value = serializeOverrides({ zed: "b", alpha: "a" });
    expect(value).toBe("alpha:a,zed:b");
    expect(parseOverrides(value)).toEqual({ alpha: "a", zed: "b" });
    expect(
      applyOverridesToUrl("https://example.test/path?keep=1", { zed: "b" })
        .href,
    ).toBe("https://example.test/path?keep=1&__exp=zed%3Ab");
  });

  it("ignores malformed entries without evaluating input", () => {
    expect(
      parseOverrides("ok:variant,bad,nope:,x:%E0%A4%A,<script>:x,ok:latest"),
    ).toEqual({
      ok: "latest",
    });
  });
});
