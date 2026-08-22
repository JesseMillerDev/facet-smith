// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExperimentProvider, createClientExperiment } from "@facet-smith/react";
import { ExperimentInspector } from "../src";

const Box = createClientExperiment({
  id: "box",
  iteration: "launch-1",
  defaultVariant: "a",
  variants: {
    a: { component: () => <div>A version</div>, revision: "1" },
    b: { component: () => <div>B version</div>, revision: "1" },
  },
  allocation: { a: 1, b: 0 },
});

const Nested = createClientExperiment({
  id: "nested",
  iteration: "launch-1",
  defaultVariant: "inside",
  variants: {
    inside: { component: () => <div>Nested version</div>, revision: "1" },
  },
  allocation: { inside: 1 },
});

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(10, 20, 200, 80),
  );
});

function Harness({ enabled = true }: { enabled?: boolean }) {
  return (
    <ExperimentProvider
      subjectId="test"
      inspector={{
        enabled,
        environment: "development",
        component: ExperimentInspector,
      }}
    >
      <Box />
      <Nested />
    </ExperimentProvider>
  );
}

describe("inspector", () => {
  it("is absent when disabled and registers nested experiments when enabled", async () => {
    const { rerender } = render(<Harness enabled={false} />);
    expect(
      screen.queryByLabelText("FacetSmith toolbar"),
    ).not.toBeInTheDocument();
    rerender(<Harness />);
    expect(
      await screen.findByText("2 mounted experiments"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /box · a/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /nested · inside/ }),
    ).toBeInTheDocument();
  });

  it("switches and resets a variant", async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: /box · a/ }));
    fireEvent.click(screen.getByRole("button", { name: /b revision 1/ }));
    expect(await screen.findByText("B version")).toBeInTheDocument();
    expect(localStorage.getItem("__facetsmith-overrides")).toBe("box:b");
    fireEvent.click(await screen.findByRole("button", { name: /box · b/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(await screen.findByText("A version")).toBeInTheDocument();
  });

  it("loads URL overrides ahead of local storage and copies stable URLs", async () => {
    localStorage.setItem("__facetsmith-overrides", "box:a");
    window.history.replaceState(null, "", "/?__exp=box:b");
    render(<Harness />);
    expect(await screen.findByText("B version")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy current URL" }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalled(),
    );
    expect(
      vi.mocked(navigator.clipboard.writeText).mock.calls[0]?.[0],
    ).toContain("__exp=box%3Ab");
  });

  it("supports keyboard opening and Escape dismissal", async () => {
    render(<Harness />);
    const button = await screen.findByRole("button", { name: /box · a/ });
    button.focus();
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.click(button);
    expect(
      screen.getByRole("dialog", { name: "Variants for box" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Variants for box" }),
    ).not.toBeInTheDocument();
  });
});
