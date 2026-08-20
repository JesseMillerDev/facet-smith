// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryAnalyticsAdapter } from "@facet-smith/analytics";
import {
  EXPERIMENT_MARKER_ATTRIBUTES,
  ExperimentProvider,
  createClientExperiment,
  experimentMarkerSelector,
} from "../src";

interface GreetingProps {
  readonly name: string;
}

const Greeting = createClientExperiment({
  id: "greeting",
  defaultVariant: "control",
  variants: {
    control: {
      component: ({ name }: GreetingProps) => <div>Control {name}</div>,
      revision: "1",
    },
    warm: {
      component: ({ name }: GreetingProps) => <div>Welcome {name}</div>,
      revision: "2",
    },
  },
  allocation: { control: 1, warm: 0 },
});

let observerCallback: IntersectionObserverCallback;
const disconnect = vi.fn();

beforeEach(() => {
  disconnect.mockClear();
  class MockObserver {
    constructor(callback: IntersectionObserverCallback) {
      observerCallback = callback;
    }
    observe = vi.fn();
    disconnect = disconnect;
    unobserve = vi.fn();
    takeRecords = () => [];
    root = null;
    rootMargin = "0px";
    thresholds = [0.01];
  }
  vi.stubGlobal("IntersectionObserver", MockObserver);
  localStorage.clear();
});

describe("React experiments", () => {
  it("renders deterministic and explicit override variants", () => {
    const { rerender } = render(
      <ExperimentProvider subjectId="alice">
        <Greeting name="Ada" />
      </ExperimentProvider>,
    );
    expect(screen.getByText("Control Ada")).toBeInTheDocument();
    rerender(
      <ExperimentProvider
        subjectId="alice"
        developerOverrides={{ greeting: "warm" }}
      >
        <Greeting name="Ada" />
      </ExperimentProvider>,
    );
    expect(screen.getByText("Welcome Ada")).toBeInTheDocument();
  });

  it("does not expose before visibility and deduplicates rerenders", () => {
    const analytics = new InMemoryAnalyticsAdapter();
    const { rerender } = render(
      <ExperimentProvider subjectId="alice" analytics={analytics}>
        <Greeting name="Ada" />
      </ExperimentProvider>,
    );
    expect(analytics.events).toHaveLength(0);
    act(() => {
      observerCallback(
        [
          {
            isIntersecting: true,
            intersectionRatio: 1,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });
    expect(analytics.events).toHaveLength(1);
    rerender(
      <ExperimentProvider subjectId="alice" analytics={analytics}>
        <Greeting name="Grace" />
      </ExperimentProvider>,
    );
    act(() => {
      observerCallback(
        [
          {
            isIntersecting: true,
            intersectionRatio: 1,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });
    expect(analytics.events).toHaveLength(1);
  });

  it("is safe without a provider", () => {
    render(<Greeting name="Ada" />);
    expect(screen.getByText("Control Ada")).toBeInTheDocument();
  });

  it("honors a matching pre-resolved server assignment on first render", () => {
    render(
      <ExperimentProvider
        subjectId="alice"
        initialAssignments={{
          greeting: {
            experimentId: "greeting",
            variantId: "warm",
            variantRevision: "2",
            source: "qa-override",
          },
        }}
      >
        <Greeting name="Ada" />
      </ExperimentProvider>,
    );
    expect(screen.getByText("Welcome Ada")).toBeInTheDocument();
  });

  it("exports stable inspector-only test markers", () => {
    const { container } = render(
      <ExperimentProvider
        subjectId="alice"
        inspector={{ enabled: true, environment: "test" }}
      >
        <Greeting name="Ada" />
      </ExperimentProvider>,
    );
    const marker = container.querySelector(
      experimentMarkerSelector("greeting"),
    );

    expect(marker).toHaveAttribute(EXPERIMENT_MARKER_ATTRIBUTES.id, "greeting");
    expect(marker).toHaveAttribute(
      EXPERIMENT_MARKER_ATTRIBUTES.variant,
      "control",
    );
    expect(() => experimentMarkerSelector("not valid")).toThrow(TypeError);
  });

  it("omits inspector markers when the inspector is disabled", () => {
    const { container } = render(
      <ExperimentProvider subjectId="alice">
        <Greeting name="Ada" />
      </ExperimentProvider>,
    );

    expect(
      container.querySelector(experimentMarkerSelector("greeting")),
    ).toBeNull();
  });
});
