// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryAnalyticsAdapter } from "@facet-smith/analytics";
import {
  EXPERIMENT_MARKER_ATTRIBUTES,
  ExperimentProvider,
  createClientExperiment,
  experimentMarkerSelector,
  useExposedExperiments,
} from "../src";

interface GreetingProps {
  readonly name: string;
}

const Greeting = createClientExperiment({
  id: "greeting",
  iteration: "launch-1",
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
let observedTargets: Element[];

function AttributionProbe() {
  const attribution = useExposedExperiments();
  return (
    <output data-testid="attribution">{JSON.stringify(attribution)}</output>
  );
}

beforeEach(() => {
  disconnect.mockClear();
  observedTargets = [];
  class MockObserver {
    constructor(callback: IntersectionObserverCallback) {
      observerCallback = callback;
    }
    observe = vi.fn((target: Element) => observedTargets.push(target));
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
            target: observedTargets.at(-1),
            isIntersecting: true,
            intersectionRatio: 1,
          } as unknown as IntersectionObserverEntry,
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
            target: observedTargets.at(-1),
            isIntersecting: true,
            intersectionRatio: 1,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });
    expect(analytics.events).toHaveLength(1);
  });

  it("observes every top-level variant element and exposes when any is visible", () => {
    const MultiRoot = createClientExperiment({
      id: "multi-root",
      iteration: "launch-1",
      defaultVariant: "mixed",
      variants: {
        mixed: {
          revision: "1",
          component: () => (
            <>
              <div hidden>Hidden first root</div>
              <button>Visible second root</button>
            </>
          ),
        },
      },
      allocation: { mixed: 1 },
    });
    const analytics = new InMemoryAnalyticsAdapter();
    render(
      <ExperimentProvider subjectId="alice" analytics={analytics}>
        <MultiRoot />
      </ExperimentProvider>,
    );

    const visibleButton = screen.getByRole("button");
    expect(observedTargets).toContain(screen.getByText("Hidden first root"));
    expect(observedTargets).toContain(visibleButton);
    act(() => {
      observerCallback(
        [
          {
            target: visibleButton,
            isIntersecting: true,
            intersectionRatio: 1,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });

    expect(analytics.events).toHaveLength(1);
  });

  it("uses an exposure sentinel for text-only variants", () => {
    const TextOnly = createClientExperiment({
      id: "text-only",
      iteration: "launch-1",
      defaultVariant: "plain",
      variants: {
        plain: { revision: "1", component: () => <>Just text</> },
      },
      allocation: { plain: 1 },
    });
    const analytics = new InMemoryAnalyticsAdapter();
    const { container } = render(
      <ExperimentProvider analytics={analytics}>
        <TextOnly />
      </ExperimentProvider>,
    );

    expect(screen.getByText("Just text")).toBeInTheDocument();
    const sentinel = container.querySelector('[aria-hidden="true"]');
    expect(sentinel).not.toBeNull();
    expect(observedTargets).toContain(sentinel);
    act(() => {
      observerCallback(
        [
          {
            target: sentinel,
            isIntersecting: true,
            intersectionRatio: 1,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });
    expect(analytics.events).toHaveLength(1);
  });

  it("observes visible direct text even when a hidden element is also rendered", () => {
    const MixedText = createClientExperiment({
      id: "mixed-text",
      iteration: "launch-1",
      defaultVariant: "mixed",
      variants: {
        mixed: {
          revision: "1",
          component: () => (
            <>
              Visible text<div hidden>Hidden element</div>
            </>
          ),
        },
      },
      allocation: { mixed: 1 },
    });
    const analytics = new InMemoryAnalyticsAdapter();
    const { container } = render(
      <ExperimentProvider analytics={analytics}>
        <MixedText />
      </ExperimentProvider>,
    );

    const sentinel = container.querySelector('[aria-hidden="true"]');
    expect(sentinel).not.toBeNull();
    expect(observedTargets).toContain(sentinel);
    act(() => {
      observerCallback(
        [
          {
            target: sentinel,
            isIntersecting: true,
            intersectionRatio: 1,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });
    expect(analytics.events).toHaveLength(1);
  });

  it("stops observing a text sentinel when direct text is removed", async () => {
    const DynamicText = createClientExperiment({
      id: "dynamic-text",
      iteration: "launch-1",
      defaultVariant: "dynamic",
      variants: {
        dynamic: {
          revision: "1",
          component: ({ show }: { show: boolean }) =>
            show ? <>Temporary text</> : null,
        },
      },
      allocation: { dynamic: 1 },
    });
    const analytics = new InMemoryAnalyticsAdapter();
    const { container, rerender } = render(
      <ExperimentProvider analytics={analytics}>
        <DynamicText show />
      </ExperimentProvider>,
    );
    const sentinel = container.querySelector('[aria-hidden="true"]');
    expect(sentinel).not.toBeNull();

    rerender(
      <ExperimentProvider analytics={analytics}>
        <DynamicText show={false} />
      </ExperimentProvider>,
    );
    await waitFor(() =>
      expect(container.querySelector('[aria-hidden="true"]')).toBeNull(),
    );
    act(() => {
      observerCallback(
        [
          {
            target: sentinel,
            isIntersecting: true,
            intersectionRatio: 1,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });
    expect(analytics.events).toHaveLength(0);
  });

  it("does not expose a null-rendering variant", () => {
    const NullOnly = createClientExperiment({
      id: "null-only",
      iteration: "launch-1",
      defaultVariant: "empty",
      variants: { empty: { revision: "1", component: () => null } },
      allocation: { empty: 1 },
    });
    const analytics = new InMemoryAnalyticsAdapter();
    render(
      <ExperimentProvider analytics={analytics}>
        <NullOnly />
      </ExperimentProvider>,
    );

    expect(observedTargets).toEqual([]);
    expect(analytics.events).toHaveLength(0);
  });

  it("does not expose null output in the no-IntersectionObserver fallback", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const NullOnly = createClientExperiment({
      id: "fallback-null",
      iteration: "launch-1",
      defaultVariant: "empty",
      variants: { empty: { revision: "1", component: () => null } },
      allocation: { empty: 1 },
    });
    const analytics = new InMemoryAnalyticsAdapter();

    render(
      <ExperimentProvider analytics={analytics}>
        <NullOnly />
      </ExperimentProvider>,
    );

    expect(analytics.events).toHaveLength(0);
  });

  it("makes only visibly exposed assignments available for app analytics", () => {
    const { rerender } = render(
      <ExperimentProvider subjectId="alice">
        <Greeting name="Ada" />
        <AttributionProbe />
      </ExperimentProvider>,
    );
    expect(
      JSON.parse(screen.getByTestId("attribution").textContent ?? ""),
    ).toEqual({ subjectId: "alice", exposures: [] });

    act(() => {
      observerCallback(
        [
          {
            target: observedTargets.at(-1),
            isIntersecting: true,
            intersectionRatio: 1,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });
    expect(
      JSON.parse(screen.getByTestId("attribution").textContent ?? ""),
    ).toEqual({
      subjectId: "alice",
      exposures: [
        {
          experimentId: "greeting",
          experimentIteration: "launch-1",
          variantId: "control",
          variantRevision: "1",
          assignmentSource: "deterministic",
        },
      ],
    });

    rerender(
      <ExperimentProvider
        subjectId="alice"
        developerOverrides={{ greeting: "warm" }}
      >
        <Greeting name="Ada" />
        <AttributionProbe />
      </ExperimentProvider>,
    );
    act(() => {
      observerCallback(
        [
          {
            target: observedTargets.at(-1),
            isIntersecting: true,
            intersectionRatio: 1,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });
    expect(
      JSON.parse(screen.getByTestId("attribution").textContent ?? ""),
    ).toMatchObject({
      exposures: [
        {
          experimentId: "greeting",
          experimentIteration: "launch-1",
          variantId: "warm",
          variantRevision: "2",
          assignmentSource: "developer-override",
        },
      ],
    });

    rerender(
      <ExperimentProvider
        subjectId="bob"
        developerOverrides={{ greeting: "warm" }}
      >
        <Greeting name="Ada" />
        <AttributionProbe />
      </ExperimentProvider>,
    );
    expect(
      JSON.parse(screen.getByTestId("attribution").textContent ?? ""),
    ).toEqual({ subjectId: "bob", exposures: [] });
    act(() => {
      observerCallback(
        [
          {
            target: observedTargets.at(-1),
            isIntersecting: true,
            intersectionRatio: 1,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });
    expect(
      JSON.parse(screen.getByTestId("attribution").textContent ?? ""),
    ).toMatchObject({
      subjectId: "bob",
      exposures: [{ experimentId: "greeting", variantId: "warm" }],
    });
  });

  it("returns empty attribution without a provider", () => {
    render(<AttributionProbe />);
    expect(
      JSON.parse(screen.getByTestId("attribution").textContent ?? ""),
    ).toEqual({ exposures: [] });
  });

  it("is safe without a provider", () => {
    render(<Greeting name="Ada" />);
    expect(screen.getByText("Control Ada")).toBeInTheDocument();
  });

  it("fails loudly when one provider sees conflicting experiment IDs", () => {
    const First = createClientExperiment({
      id: "collision",
      iteration: "launch-1",
      defaultVariant: "control",
      variants: { control: { revision: "1", component: () => null } },
      allocation: { control: 1 },
    });
    const Second = createClientExperiment({
      id: "collision",
      iteration: "launch-2",
      defaultVariant: "control",
      variants: { control: { revision: "1", component: () => null } },
      allocation: { control: 1 },
    });

    expect(() =>
      render(
        <ExperimentProvider>
          <First />
          <Second />
        </ExperimentProvider>,
      ),
    ).toThrow(/Conflicting definitions use experiment ID/);
  });

  it("honors a matching pre-resolved server assignment on first render", () => {
    render(
      <ExperimentProvider
        subjectId="alice"
        initialAssignments={{
          greeting: {
            experimentId: "greeting",
            experimentIteration: "launch-1",
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

  it("rejects a pre-resolved assignment with a mismatched experiment ID", () => {
    render(
      <ExperimentProvider
        subjectId="alice"
        initialAssignments={{
          greeting: {
            experimentId: "another-experiment",
            experimentIteration: "launch-1",
            variantId: "warm",
            variantRevision: "2",
            source: "qa-override",
          },
        }}
      >
        <Greeting name="Ada" />
      </ExperimentProvider>,
    );

    expect(screen.getByText("Control Ada")).toBeInTheDocument();
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
