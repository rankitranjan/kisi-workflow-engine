import { ApiClientError, deleteWorkflow, listWorkflows, setWorkflowEnabled } from "../api/client";
import { ToastProvider } from "../components/toast";
import { sampleWorkflow } from "../test/fixtures";
import { WorkflowList } from "./WorkflowList";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    listWorkflows: vi.fn(),
    deleteWorkflow: vi.fn(),
    setWorkflowEnabled: vi.fn(),
  };
});

const workflow = sampleWorkflow();

function renderList() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <WorkflowList />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("WorkflowList", () => {
  beforeEach(() => {
    vi.mocked(listWorkflows).mockReset();
    vi.mocked(deleteWorkflow).mockReset();
    vi.mocked(setWorkflowEnabled).mockReset();
  });

  it("shows a workflow name and enabled state", async () => {
    vi.mocked(listWorkflows).mockResolvedValue([workflow]);
    renderList();

    expect(screen.getByText("Loading workflows...")).toBeInTheDocument();
    expect(await screen.findByText("Unlock alerts")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit Unlock alerts" })).toHaveAttribute(
      "href",
      `/workflows/${workflow.id}`,
    );
  });

  it("shows an empty state", async () => {
    vi.mocked(listWorkflows).mockResolvedValue([]);
    renderList();

    expect(await screen.findByText("No workflows yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create Workflow" })).toHaveAttribute(
      "href",
      "/workflows/new",
    );
  });

  it("shows a load error and retries", async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkflows)
      .mockRejectedValueOnce(new ApiClientError({ error: "unauthorized" }))
      .mockResolvedValueOnce([workflow]);
    renderList();

    expect(await screen.findByText("The demo access credential was rejected.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Unlock alerts")).toBeInTheDocument();
    expect(listWorkflows).toHaveBeenCalledTimes(2);
  });

  it("does not delete when confirmation is declined", async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkflows).mockResolvedValue([workflow]);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderList();

    await user.click(await screen.findByRole("button", { name: "Delete Unlock alerts" }));

    expect(window.confirm).toHaveBeenCalledWith("Delete Unlock alerts? This cannot be undone.");
    expect(deleteWorkflow).not.toHaveBeenCalled();
    expect(screen.getByText("Unlock alerts")).toBeInTheDocument();
  });

  it("deletes a workflow after confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkflows).mockResolvedValue([workflow]);
    vi.mocked(deleteWorkflow).mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderList();

    await user.click(await screen.findByRole("button", { name: "Delete Unlock alerts" }));

    expect(deleteWorkflow).toHaveBeenCalledWith(workflow.id);
    expect(screen.queryByText("Unlock alerts")).not.toBeInTheDocument();
    expect(await screen.findByText("Workflow deleted successfully")).toBeInTheDocument();
  });

  it("shows an error toast when delete fails", async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkflows).mockResolvedValue([workflow]);
    vi.mocked(deleteWorkflow).mockRejectedValue(new ApiClientError({ error: "internal_error" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderList();

    await user.click(await screen.findByRole("button", { name: "Delete Unlock alerts" }));

    expect(await screen.findByText("Failed to delete workflow")).toBeInTheDocument();
    expect(screen.getByText("Unlock alerts")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("disables a workflow with PATCH", async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkflows).mockResolvedValue([workflow]);
    vi.mocked(setWorkflowEnabled).mockResolvedValue(sampleWorkflow({ enabled: false }));
    renderList();

    await user.click(await screen.findByRole("button", { name: "Disable Unlock alerts" }));

    expect(setWorkflowEnabled).toHaveBeenCalledWith(workflow.id, false);
    expect(await screen.findByText("Disabled")).toBeInTheDocument();
    expect(await screen.findByText("Workflow disabled")).toBeInTheDocument();
  });

  it("enables a workflow", async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkflows).mockResolvedValue([sampleWorkflow({ enabled: false })]);
    vi.mocked(setWorkflowEnabled).mockResolvedValue(workflow);
    renderList();

    await user.click(await screen.findByRole("button", { name: "Enable Unlock alerts" }));

    expect(setWorkflowEnabled).toHaveBeenCalledWith(workflow.id, true);
    expect(await screen.findByText("Workflow enabled")).toBeInTheDocument();
  });

  it("shows an error toast when enable or disable fails", async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkflows).mockResolvedValue([workflow]);
    vi.mocked(setWorkflowEnabled).mockRejectedValue(new ApiClientError({ error: "internal_error" }));
    renderList();

    await user.click(await screen.findByRole("button", { name: "Disable Unlock alerts" }));

    expect(await screen.findByText("Failed to update workflow")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
  });

  it("copies a trigger URL from the list", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(listWorkflows).mockResolvedValue([workflow]);
    renderList();

    await user.click(await screen.findByRole("button", { name: "Copy trigger URL for Unlock alerts" }));

    expect(writeText).toHaveBeenCalledWith(workflow.triggerUrl);
    expect(await screen.findByText("Trigger URL copied")).toBeInTheDocument();
  });

  it("shows an error toast when copying a trigger URL fails", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error("denied")) },
    });
    vi.mocked(listWorkflows).mockResolvedValue([workflow]);
    renderList();

    await user.click(await screen.findByRole("button", { name: "Copy trigger URL for Unlock alerts" }));

    expect(await screen.findByText("Failed to copy trigger URL")).toBeInTheDocument();
  });
});
