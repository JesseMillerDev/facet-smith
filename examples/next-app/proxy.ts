import { createExperimentProxy } from "@facet-smith/next/proxy";

export const proxy = createExperimentProxy();

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
