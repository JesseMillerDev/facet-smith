import {
  NextRequest,
  NextResponse,
  type NextFetchEvent,
  type NextProxy,
} from "next/server.js";
import {
  EXPERIMENT_SUBJECT_COOKIE,
  EXPERIMENT_SUBJECT_HEADER,
} from "./constants";

const DEFAULT_SUBJECT_MAX_AGE = 60 * 60 * 24 * 365;

export interface ExperimentProxyOptions {
  /** Defaults to a cryptographically random UUID. */
  readonly generateSubjectId?: () => string;
  readonly cookieName?: string;
  readonly headerName?: string;
  readonly maxAge?: number;
  readonly secure?: boolean;
}

function copyContinuationResponse(
  response: NextResponse,
  requestHeaders: Headers,
): NextResponse {
  const forwarded = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of response.headers) {
    if (
      name === "set-cookie" ||
      name === "x-middleware-next" ||
      name === "x-middleware-override-headers" ||
      name.startsWith("x-middleware-request-")
    ) {
      continue;
    }
    forwarded.headers.set(name, value);
  }
  for (const cookie of response.cookies.getAll()) {
    forwarded.cookies.set(cookie);
  }
  return forwarded;
}

function ensureSubjectForwarding(
  response: NextResponse,
  requestHeaders: Headers,
  headerName: string,
): NextResponse {
  if (response.headers.get("x-middleware-next") !== "1") return response;

  const overrideHeader = response.headers.get("x-middleware-override-headers");
  if (!overrideHeader) {
    return copyContinuationResponse(response, requestHeaders);
  }

  const forwardedNames = new Set(
    overrideHeader.split(",").map((name) => name.trim().toLowerCase()),
  );
  if (!forwardedNames.has(headerName.toLowerCase())) {
    throw new Error(
      `The wrapped Next.js proxy replaced forwarded request headers without preserving ${headerName}. Include the incoming request headers in NextResponse.next({ request: { headers } }).`,
    );
  }
  return response;
}

function normalizeResponse(
  result: Awaited<ReturnType<NextProxy>>,
  requestHeaders: Headers,
  headerName: string,
): NextResponse {
  if (result == null) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  if (result instanceof NextResponse) {
    return ensureSubjectForwarding(result, requestHeaders, headerName);
  }
  return new NextResponse(result.body, result);
}

/**
 * Adds a stable anonymous subject to a Next.js Proxy request and response.
 * The wrapped proxy receives a request that already contains the subject
 * header, so existing request-header forwarding composes naturally.
 */
export function withExperimentSubject(
  proxy: NextProxy,
  options: ExperimentProxyOptions = {},
): NextProxy {
  const cookieName = options.cookieName ?? EXPERIMENT_SUBJECT_COOKIE;
  const headerName = options.headerName ?? EXPERIMENT_SUBJECT_HEADER;
  const generateSubjectId =
    options.generateSubjectId ?? (() => crypto.randomUUID());

  return async function experimentSubjectProxy(
    request: NextRequest,
    event: NextFetchEvent,
  ) {
    const cookieSubject = request.cookies.get(cookieName)?.value;
    const existingSubject = cookieSubject ? cookieSubject : undefined;
    const subjectId = existingSubject ?? generateSubjectId();
    if (!subjectId) {
      throw new Error("FacetSmith subject generation returned an empty ID.");
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(headerName, subjectId);
    const forwardedRequest = new NextRequest(request, {
      headers: requestHeaders,
    });
    const result = await proxy(forwardedRequest, event);
    const response = normalizeResponse(result, requestHeaders, headerName);

    if (!existingSubject) {
      response.cookies.set(cookieName, subjectId, {
        httpOnly: true,
        sameSite: "lax",
        secure: options.secure ?? process.env.NODE_ENV === "production",
        path: "/",
        maxAge: options.maxAge ?? DEFAULT_SUBJECT_MAX_AGE,
      });
    }
    return response;
  };
}

/** Creates the complete anonymous-subject proxy for apps without one. */
export function createExperimentProxy(
  options: ExperimentProxyOptions = {},
): NextProxy {
  return withExperimentSubject(() => NextResponse.next(), options);
}
