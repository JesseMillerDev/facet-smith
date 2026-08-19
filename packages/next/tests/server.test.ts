import { describe, expect, it } from "vitest";
import {
  createNextExperiment,
  createOverrideRouteHandler,
  readExperimentOverrideCookie,
} from "../src/server";

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
