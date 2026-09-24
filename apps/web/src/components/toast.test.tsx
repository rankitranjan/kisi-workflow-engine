import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast } from "./toast";

function Harness() {
  const { showToast } = useToast();
  return (
    <>
      <button type="button" onClick={() => showToast("Workflow created successfully", "success")}>
        Show success
      </button>
      <button type="button" onClick={() => showToast("Failed to save workflow", "error")}>
        Show error
      </button>
    </>
  );
}

function renderToasts() {
  return render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
}

describe("ToastProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows success and error toasts", () => {
    renderToasts();

    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    fireEvent.click(screen.getByRole("button", { name: "Show error" }));

    expect(screen.getByRole("status")).toHaveTextContent("Workflow created successfully");
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to save workflow");
  });

  it("stacks multiple toasts", () => {
    renderToasts();

    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    fireEvent.click(screen.getByRole("button", { name: "Show success" }));

    expect(screen.getAllByText("Workflow created successfully")).toHaveLength(2);
  });

  it("dismisses one toast without removing the other", () => {
    renderToasts();

    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    fireEvent.click(screen.getByRole("button", { name: "Show error" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Workflow created successfully" }));

    expect(screen.queryByText("Workflow created successfully")).not.toBeInTheDocument();
    expect(screen.getByText("Failed to save workflow")).toBeInTheDocument();
  });

  it("removes a toast after 3 seconds", () => {
    vi.useFakeTimers();
    renderToasts();

    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    expect(screen.getByText("Workflow created successfully")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText("Workflow created successfully")).not.toBeInTheDocument();
  });
});
