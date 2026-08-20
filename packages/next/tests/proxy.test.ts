import { NextRequest, NextResponse, type NextFetchEvent } from "next/server.js";
import { describe, expect, it, vi } from "vitest";
import {
  EXPERIMENT_SUBJECT_COOKIE,
  EXPERIMENT_SUBJECT_HEADER,
} from "../src/constants";
import { createExperimentProxy, withExperimentSubject } from "../src/proxy";

const event = {} as NextFetchEvent;

describe("Next.js experiment proxy", () => {
  it("creates and forwards a stable anonymous subject", async () => {
    const proxy = createExperimentProxy({
      generateSubjectId: () => "subject-123",
      secure: false,
    });
    const response = await proxy(
      new NextRequest("https://example.test/pricing"),
      event,
    );

    expect(response).toBeInstanceOf(NextResponse);
    expect(
      response?.headers.get(
        `x-middleware-request-${EXPERIMENT_SUBJECT_HEADER}`,
      ),
    ).toBe("subject-123");
    expect(response?.headers.get("set-cookie")).toContain(
      `${EXPERIMENT_SUBJECT_COOKIE}=subject-123`,
    );
    expect(response?.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response?.headers.get("set-cookie")).toContain("SameSite=lax");
  });

  it("composes with an existing proxy and preserves its response", async () => {
    const existingProxy = vi.fn((request: NextRequest) => {
      expect(request.headers.get(EXPERIMENT_SUBJECT_HEADER)).toBe("generated");
      const response = NextResponse.next();
      response.headers.set("x-existing-proxy", "preserved");
      return response;
    });
    const proxy = withExperimentSubject(existingProxy, {
      generateSubjectId: () => "generated",
      secure: false,
    });
    const response = await proxy(
      new NextRequest("https://example.test/"),
      event,
    );

    expect(existingProxy).toHaveBeenCalledOnce();
    expect(response?.headers.get("x-existing-proxy")).toBe("preserved");
    expect(
      response?.headers.get(
        `x-middleware-request-${EXPERIMENT_SUBJECT_HEADER}`,
      ),
    ).toBe("generated");
  });

  it("reuses the cookie subject without resetting it", async () => {
    const proxy = createExperimentProxy({
      generateSubjectId: () => "unexpected",
      secure: false,
    });
    const response = await proxy(
      new NextRequest("https://example.test/", {
        headers: {
          cookie: `${EXPERIMENT_SUBJECT_COOKIE}=existing-subject`,
        },
      }),
      event,
    );

    expect(
      response?.headers.get(
        `x-middleware-request-${EXPERIMENT_SUBJECT_HEADER}`,
      ),
    ).toBe("existing-subject");
    expect(response?.headers.get("set-cookie")).toBeNull();
  });

  it("replaces an empty subject cookie", async () => {
    const proxy = createExperimentProxy({
      generateSubjectId: () => "replacement-subject",
      secure: false,
    });
    const response = await proxy(
      new NextRequest("https://example.test/", {
        headers: { cookie: `${EXPERIMENT_SUBJECT_COOKIE}=` },
      }),
      event,
    );

    expect(
      response?.headers.get(
        `x-middleware-request-${EXPERIMENT_SUBJECT_HEADER}`,
      ),
    ).toBe("replacement-subject");
    expect(response?.headers.get("set-cookie")).toContain(
      `${EXPERIMENT_SUBJECT_COOKIE}=replacement-subject`,
    );
  });

  it("persists the subject across redirects", async () => {
    const proxy = withExperimentSubject(
      (request) => NextResponse.redirect(new URL("/home", request.url)),
      { generateSubjectId: () => "redirect-subject", secure: false },
    );
    const response = await proxy(
      new NextRequest("https://example.test/"),
      event,
    );

    expect(response?.headers.get("location")).toBe("https://example.test/home");
    expect(response?.headers.get("set-cookie")).toContain(
      `${EXPERIMENT_SUBJECT_COOKIE}=redirect-subject`,
    );
  });

  it("rejects an existing request-header allow-list that drops the subject", async () => {
    const proxy = withExperimentSubject(
      () =>
        NextResponse.next({
          request: { headers: new Headers({ "x-existing": "preserved" }) },
        }),
      { generateSubjectId: () => "generated", secure: false },
    );

    await expect(
      proxy(new NextRequest("https://example.test/"), event),
    ).rejects.toThrow(`without preserving ${EXPERIMENT_SUBJECT_HEADER}`);
  });
});
