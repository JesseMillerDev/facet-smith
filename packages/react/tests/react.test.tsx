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

  it("resolves a custom synchronous assignment without source allocation", () => {
    const Custom = createClientExperiment(
      {
        id: "custom-sync",
        iteration: "launch-1",
        defaultVariant: "control",
        variants: {
          control: { revision: "1", component: () => <p>Control</p> },
          treatment: { revision: "1", component: () => <p>Treatment</p> },
        },
      },
      {
        id: "application-flags",
        resolve: () => ({ decision: "assigned", variantId: "treatment" }),
      },
    );

    render(
      <ExperimentProvider subjectId="alice">
        <Custom />
      </ExperimentProvider>,
    );
    expect(screen.getByText("Treatment")).toBeInTheDocument();
  });

  it("renders an explicit unexposed fallback while an async resolver is pending", async () => {
    let complete:
      | ((value: { decision: "assigned"; variantId: string }) => void)
      | undefined;
    const resolveAssignment = vi.fn(
      () =>
        new Promise<{ decision: "assigned"; variantId: string }>((resolve) => {
          complete = resolve;
        }),
    );
    const Custom = createClientExperiment(
      {
        id: "custom-async",
        iteration: "launch-1",
        defaultVariant: "control",
        variants: {
          control: { revision: "1", component: () => <p>Pending control</p> },
          treatment: {
            revision: "1",
            component: () => <p>Async treatment</p>,
          },
        },
      },
      {
        id: "async-flags",
        resolve: resolveAssignment,
      },
      { fallback: () => <p>Loading assignment</p> },
    );
    const analytics = new InMemoryAnalyticsAdapter();
    render(
      <ExperimentProvider subjectId="alice" analytics={analytics}>
        <Custom />
      </ExperimentProvider>,
    );

    expect(screen.getByText("Loading assignment")).toBeInTheDocument();
    expect(screen.queryByText("Pending control")).not.toBeInTheDocument();
    expect(analytics.events).toHaveLength(0);
    act(() => complete?.({ decision: "assigned", variantId: "treatment" }));
    expect(await screen.findByText("Async treatment")).toBeInTheDocument();
    expect(analytics.events).toHaveLength(0);
    expect(resolveAssignment).toHaveBeenCalledOnce();
  });

  it("warns and paints no implicit default when client async fallback is omitted", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const Custom = createClientExperiment(
      {
        id: "custom-async-without-fallback",
        iteration: "launch-1",
        defaultVariant: "control",
        variants: {
          control: { revision: "1", component: () => <p>Implicit control</p> },
          treatment: {
            revision: "1",
            component: () => <p>Resolved treatment</p>,
          },
        },
      },
      {
        id: "async-without-fallback",
        resolve: async () => ({
          decision: "assigned",
          variantId: "treatment",
        }),
      },
    );

    render(
      <ExperimentProvider subjectId="alice">
        <Custom />
      </ExperimentProvider>,
    );

    expect(screen.queryByText("Implicit control")).not.toBeInTheDocument();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("without an explicit fallback"),
    );
    expect(await screen.findByText("Resolved treatment")).toBeInTheDocument();
    warning.mockRestore();
  });

  it("does not expose a no-subject or rejected resolver default", () => {
    const analytics = new InMemoryAnalyticsAdapter();
    const Rejected = createClientExperiment(
      {
        id: "rejected-variant",
        iteration: "launch-1",
        defaultVariant: "control",
        variants: {
          control: { revision: "1", component: () => <p>Safe default</p> },
          treatment: { revision: "1", component: () => <p>Treatment</p> },
        },
      },
      {
        id: "invalid-flags",
        resolve: () => ({ decision: "assigned", variantId: "remote-only" }),
      },
    );
    const { rerender } = render(
      <ExperimentProvider analytics={analytics}>
        <Greeting name="Ada" />
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
    expect(analytics.events).toHaveLength(0);

    rerender(
      <ExperimentProvider subjectId="alice" analytics={analytics}>
        <Rejected />
      </ExperimentProvider>,
    );
    expect(screen.getByText("Safe default")).toBeInTheDocument();
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
    expect(analytics.events).toHaveLength(0);
  });

  it("renders an ineligible resolver value without exposing it", () => {
    const analytics = new InMemoryAnalyticsAdapter();
    const Ineligible = createClientExperiment(
      {
        id: "ineligible-variant",
        iteration: "launch-1",
        defaultVariant: "control",
        variants: {
          control: { revision: "1", component: () => <p>Not targeted</p> },
          treatment: {
            revision: "1",
            component: () => <p>Forced treatment</p>,
          },
        },
      },
      {
        id: "targeting-flags",
        resolve: () =>
          ({
            decision: "ineligible",
            variantId: "treatment",
            diagnostics: [
              {
                code: "FORCED_VALUE",
                message: "Vendor forced a non-experiment value.",
              },
            ],
          }) as const,
      },
    );

    render(
      <ExperimentProvider subjectId="alice" analytics={analytics}>
        <Ineligible />
      </ExperimentProvider>,
    );

    expect(screen.getByText("Forced treatment")).toBeInTheDocument();
    expect(observedTargets).toHaveLength(0);
    expect(analytics.events).toHaveLength(0);
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
      <ExperimentProvider subjectId="alice" analytics={analytics}>
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
      <ExperimentProvider subjectId="alice" analytics={analytics}>
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
      <ExperimentProvider subjectId="alice" analytics={analytics}>
        <DynamicText show />
      </ExperimentProvider>,
    );
    const sentinel = container.querySelector('[aria-hidden="true"]');
    expect(sentinel).not.toBeNull();

    rerender(
      <ExperimentProvider subjectId="alice" analytics={analytics}>
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

  it("is safe without a provider when a custom resolver owns allocation", () => {
    const Custom = createClientExperiment(
      {
        id: "providerless-custom",
        iteration: "launch-1",
        defaultVariant: "control",
        variants: {
          control: {
            revision: "1",
            component: () => <p>Providerless control</p>,
          },
          treatment: { revision: "1", component: () => <p>Treatment</p> },
        },
      },
      {
        id: "providerless-flags",
        resolve: () => ({ decision: "assigned", variantId: "treatment" }),
      },
    );

    render(<Custom />);
    expect(screen.getByText("Providerless control")).toBeInTheDocument();
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

  it("reuses custom server assignments only for the matching resolver", () => {
    const resolver = {
      id: "hydration-flags",
      resolve: () =>
        ({ decision: "assigned", variantId: "treatment" }) as const,
    } as const;
    const Hydrated = createClientExperiment(
      {
        id: "custom-hydration",
        iteration: "launch-1",
        defaultVariant: "control",
        variants: {
          control: { revision: "1", component: () => <p>Hydrated control</p> },
          treatment: {
            revision: "1",
            component: () => <p>Resolved treatment</p>,
          },
        },
      },
      resolver,
    );
    const assignment = {
      experimentId: "custom-hydration",
      experimentIteration: "launch-1",
      variantId: "control",
      variantRevision: "1",
      source: "resolver" as const,
      resolverId: "hydration-flags",
    };
    const { rerender } = render(
      <ExperimentProvider
        subjectId="alice"
        initialAssignments={{ "custom-hydration": assignment }}
      >
        <Hydrated />
      </ExperimentProvider>,
    );
    expect(screen.getByText("Hydrated control")).toBeInTheDocument();

    rerender(
      <ExperimentProvider
        subjectId="alice"
        initialAssignments={{
          "custom-hydration": {
            ...assignment,
            resolverId: "different-flags",
          },
        }}
      >
        <Hydrated />
      </ExperimentProvider>,
    );
    expect(screen.getByText("Resolved treatment")).toBeInTheDocument();
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
