"use client";

import { SERVER_REFRESH_EVENT } from "@facet-smith/react";
import { useRouter } from "next/navigation";
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
