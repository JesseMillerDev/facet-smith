"use client";

import {
  ExperimentProvider,
  SERVER_REFRESH_EVENT,
  type ExperimentProviderProps,
} from "@facet-smith/react";
import { useRouter } from "next/navigation.js";
import { useEffect } from "react";

/** Refreshes the App Router after the provider persists a Server Component override. */
export function NextExperimentRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener(SERVER_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(SERVER_REFRESH_EVENT, refresh);
  }, [router]);
  return null;
}

/** ExperimentProvider with the server-override refresh bridge already mounted. */
export function NextExperimentProvider({
  children,
  ...providerProps
}: ExperimentProviderProps) {
  return (
    <ExperimentProvider {...providerProps}>
      <NextExperimentRefresh />
      {children}
    </ExperimentProvider>
  );
}
