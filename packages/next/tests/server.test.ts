import { describe, expect, it, vi } from "vitest";
import {
  createNextExperiment,
  createOverrideRouteHandler,
  readExperimentOptions,
  readExperimentOverrideCookie,
} from "../src/server";

const nextHeaders = vi.hoisted(() => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("next/headers.js", () => nextHeaders);

const definition = {
  id: "server-card",
  defaultVariant: "plain",
  variants: {
    plain: { revision: "1", component: () => null },
    vivid: { revision: "2", component: () => null },
  },
  allocation: { plain: 1, vivid: 0 },
} as const;

describe("Next.js server integration", () => {
  it("resolves typed server experiments", () => {
    const experiment = createNextExperiment(definition);
    expect(
      experiment.resolve({ qaOverrides: { "server-card": "vivid" } }),
    ).toMatchObject({
      variantId: "vivid",
      variantRevision: "2",
      source: "qa-override",
    });
  });

  it("reads encoded cookie overrides safely", () => {
    expect(
      readExperimentOverrideCookie({
        get: () => ({ value: "server-card%3Avivid" }),
      }),
    ).toEqual({ "server-card": "vivid" });
    expect(
      readExperimentOverrideCookie({ get: () => ({ value: "%E0%A4%A" }) }),
    ).toEqual({});
  });

  it("builds resolve options from request and URL state", async () => {
    nextHeaders.cookies.mockResolvedValue({
      get: (name: string) =>
        name === "__facetsmith_overrides"
          ? { value: "server-card%3Avivid" }
          : undefined,
    });
    nextHeaders.headers.mockResolvedValue(
      new Headers({ "x-experiment-subject": "subject-123" }),
    );

    await expect(
      readExperimentOptions({
        searchParams: Promise.resolve({
          __exp: "server-card:plain",
        }),
      }),
    ).resolves.toEqual({
      subjectId: "subject-123",
      developerOverrides: { "server-card": "plain" },
      qaOverrides: { "server-card": "vivid" },
    });
  });

  it("updates and resets validated override cookies", async () => {
    const handler = createOverrideRouteHandler({
      definitions: [definition],
      enabled: true,
      environment: "development",
    });
    const response = await handler(
      new Request("http://test/api/overrides", {
        method: "POST",
        body: JSON.stringify({
          experimentId: "server-card",
          variantId: "vivid",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("server-card%3Avivid");

    const unknown = await handler(
      new Request("http://test/api/overrides", {
        method: "POST",
        body: JSON.stringify({
          experimentId: "server-card",
          variantId: "unknown",
        }),
      }),
    );
    expect(unknown.status).toBe(422);
  });

  it("is closed in production by default", async () => {
    const handler = createOverrideRouteHandler({
      definitions: [definition],
      enabled: true,
      environment: "production",
    });
    expect(
      (
        await handler(
          new Request("http://test", {
            method: "POST",
            body: JSON.stringify({
              experimentId: "server-card",
              variantId: "vivid",
            }),
          }),
        )
      ).status,
    ).toBe(404);
  });
});
