import {
  EXPERIMENT_SUBJECT_COOKIE,
  EXPERIMENT_SUBJECT_HEADER,
} from "@facetsmith/next";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const existing = request.cookies.get(EXPERIMENT_SUBJECT_COOKIE)?.value;
  const subjectId = existing ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(EXPERIMENT_SUBJECT_HEADER, subjectId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!existing) {
    response.cookies.set(EXPERIMENT_SUBJECT_COOKIE, subjectId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
