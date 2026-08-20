// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SERVER_REFRESH_EVENT } from "@facet-smith/react";
import { NextExperimentProvider } from "../src/client";

const refresh = vi.fn();

vi.mock("next/navigation.js", () => ({
  useRouter: () => ({ refresh }),
}));

beforeEach(() => refresh.mockClear());

describe("NextExperimentProvider", () => {
  it("renders children and refreshes after a server override", () => {
    render(
      <NextExperimentProvider>
        <p>Experiment content</p>
      </NextExperimentProvider>,
    );

    expect(screen.getByText("Experiment content")).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event(SERVER_REFRESH_EVENT)));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
