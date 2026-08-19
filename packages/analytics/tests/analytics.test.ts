import { describe, expect, it, vi } from "vitest";
import {
  InMemoryAnalyticsAdapter,
  createConsoleAnalyticsAdapter,
  noopAnalyticsAdapter,
  type ExperimentExposureEvent,
} from "../src";

const event: ExperimentExposureEvent = {
  experimentId: "hero",
  variantId: "control",
  variantRevision: "1",
  assignmentSource: "default",
  timestamp: "2026-01-01T00:00:00.000Z",
};

describe("analytics adapters", () => {
  it("stores and clears events in memory", () => {
    const adapter = new InMemoryAnalyticsAdapter();
    adapter.exposure(event);
    expect(adapter.events).toEqual([event]);
    adapter.clear();
    expect(adapter.events).toEqual([]);
  });

  it("provides no-op and console adapters", () => {
    expect(noopAnalyticsAdapter.exposure(event)).toBeUndefined();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    createConsoleAnalyticsAdapter().exposure(event);
    expect(info).toHaveBeenCalledWith("[FacetSmith exposure]", event);
    info.mockRestore();
  });
});
