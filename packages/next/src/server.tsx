import {
  parseOverrides,
  OVERRIDE_QUERY_PARAMETER,
  resolveExperiment,
  serializeOverrides,
  validateExperiment,
  type AssignmentResult,
  type ExperimentDefinition,
  type ExperimentOverrides,
  type ResolveOptions,
  type VariantMetadata,
} from "@facet-smith/core";
import { ExperimentBoundary } from "@facet-smith/react";
import { cookies, headers } from "next/headers.js";
import type { ReactNode } from "react";
import {
  EXPERIMENT_OVERRIDE_COOKIE,
  EXPERIMENT_SUBJECT_COOKIE,
  EXPERIMENT_SUBJECT_HEADER,
} from "./constants";

export interface NextVariant<P> extends VariantMetadata {
  readonly component: (props: P) => ReactNode | Promise<ReactNode>;
}

export type NextExperimentRuntimeOptions = ResolveOptions;

export interface NextExperiment<
  P,
  TVariants extends Record<string, NextVariant<P>>,
> {
  readonly definition: ExperimentDefinition<TVariants>;
  resolve(
    options?: NextExperimentRuntimeOptions,
  ): AssignmentResult<keyof TVariants & string>;
  render(props: P, options?: NextExperimentRuntimeOptions): Promise<ReactNode>;
}

type NextProps<TVariants extends Record<string, NextVariant<never>>> =
  Parameters<TVariants[keyof TVariants]["component"]>[0];

export function createNextExperiment<
  const TVariants extends Record<string, NextVariant<never>>,
>(
  definition: ExperimentDefinition<TVariants>,
): NextExperiment<NextProps<TVariants>, TVariants> {
  type P = NextProps<TVariants>;
  validateExperiment(definition);
  const revisions = Object.fromEntries(
    Object.entries(definition.variants).map(([id, variant]) => [
      id,
      variant.revision,
    ]),
  );
  return {
    definition,
    resolve(options = {}) {
      return resolveExperiment(definition, options);
    },
    async render(props, options = {}) {
      const assignment = resolveExperiment(definition, options);
      const Variant = definition.variants[assignment.variantId]?.component as
        | ((props: P) => ReactNode | Promise<ReactNode>)
        | undefined;
      if (!Variant) return null;
      const rendered = await Variant(props);
      return (
        <ExperimentBoundary
          assignment={assignment}
          variants={revisions}
          renderingMode="server"
        >
          {rendered}
        </ExperimentBoundary>
      );
    },
  };
}

export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

export function readExperimentOverrideCookie(
  cookieStore: CookieReader,
  cookieName = EXPERIMENT_OVERRIDE_COOKIE,
): ExperimentOverrides {
  const raw = cookieStore.get(cookieName)?.value;
  if (!raw) return {};
  try {
    return parseOverrides(decodeURIComponent(raw));
  } catch {
    return {};
  }
}

export async function readExperimentRequest(): Promise<{
  subjectId?: string;
  overrides: ExperimentOverrides;
}> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const subjectId =
    cookieStore.get(EXPERIMENT_SUBJECT_COOKIE)?.value ??
    headerStore.get(EXPERIMENT_SUBJECT_HEADER) ??
    undefined;
  return {
    ...(subjectId === undefined ? {} : { subjectId }),
    overrides: readExperimentOverrideCookie(cookieStore),
  };
}

export type ExperimentSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

export interface ReadExperimentOptionsInput {
  readonly searchParams?:
    | ExperimentSearchParams
    | URLSearchParams
    | Promise<ExperimentSearchParams | URLSearchParams>;
}

export interface ExperimentRequestOptions {
  readonly subjectId?: string;
  readonly developerOverrides: ExperimentOverrides;
  readonly qaOverrides: ExperimentOverrides;
}

/**
 * Reads the current anonymous subject, persisted QA overrides, and URL
 * overrides into the exact options shape accepted by resolve() and render().
 */
export async function readExperimentOptions(
  input: ReadExperimentOptionsInput = {},
): Promise<ExperimentRequestOptions> {
  const [request, searchParams] = await Promise.all([
    readExperimentRequest(),
    input.searchParams,
  ]);
  const rawOverride =
    searchParams instanceof URLSearchParams
      ? searchParams.get(OVERRIDE_QUERY_PARAMETER)
      : searchParams?.[OVERRIDE_QUERY_PARAMETER];
  return {
    ...(request.subjectId === undefined
      ? {}
      : { subjectId: request.subjectId }),
    developerOverrides: parseOverrides(
      typeof rawOverride === "string" ? rawOverride : undefined,
    ),
    qaOverrides: request.overrides,
  };
}

function requestCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const pair of cookieHeader.split(";")) {
    const [key, ...parts] = pair.trim().split("=");
    if (key === name) return parts.join("=");
  }
  return undefined;
}

export interface OverrideDefinition {
  readonly id: string;
  readonly variants: Readonly<Record<string, VariantMetadata>>;
}

export interface OverrideRouteOptions {
  readonly definitions: readonly OverrideDefinition[];
  readonly enabled: boolean;
  readonly environment: string;
  readonly allowInProduction?: boolean;
  readonly cookieName?: string;
  readonly secure?: boolean;
}

export function createOverrideRouteHandler(options: OverrideRouteOptions) {
  const definitions = new Map(
    options.definitions.map((definition) => [definition.id, definition]),
  );
  return async function POST(request: Request): Promise<Response> {
    if (
      !options.enabled ||
      (options.environment === "production" &&
        options.allowInProduction !== true)
    ) {
      return Response.json(
        { error: "Inspector override endpoint is disabled" },
        { status: 404 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Expected JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid override" }, { status: 400 });
    }
    const record = body as Record<string, unknown>;
    const experimentId = record.experimentId;
    const variantId = record.variantId;
    if (
      typeof experimentId !== "string" ||
      (variantId !== null && typeof variantId !== "string")
    ) {
      return Response.json({ error: "Invalid override" }, { status: 400 });
    }
    const definition = definitions.get(experimentId);
    if (
      !definition ||
      (variantId !== null && !Object.hasOwn(definition.variants, variantId))
    ) {
      return Response.json(
        { error: "Unknown experiment or variant" },
        { status: 422 },
      );
    }

    const cookieName = options.cookieName ?? EXPERIMENT_OVERRIDE_COOKIE;
    const existingRaw = requestCookie(request, cookieName);
    const current = existingRaw
      ? parseOverrides(decodeURIComponent(existingRaw))
      : {};
    const next = { ...current };
    if (variantId === null) delete next[experimentId];
    else next[experimentId] = variantId;
    const value = encodeURIComponent(serializeOverrides(next));
    const attributes = [
      `${cookieName}=${value}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${Object.keys(next).length === 0 ? 0 : 2592000}`,
      ...(options.secure ? ["Secure"] : []),
    ];
    return Response.json(
      { ok: true, overrides: next },
      {
        headers: {
          "set-cookie": attributes.join("; "),
          "cache-control": "no-store",
        },
      },
    );
  };
}
