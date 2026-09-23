import { ApiClientError, deleteWorkflow, listWorkflows, setWorkflowEnabled } from "../api/client";
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
      <WorkflowList />
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
    expect(screen.getByRole("link", { name: "Create workflow" })).toHaveAttribute(
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
  });

  it("disables a workflow with PATCH", async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkflows).mockResolvedValue([workflow]);
    vi.mocked(setWorkflowEnabled).mockResolvedValue(sampleWorkflow({ enabled: false }));
    renderList();

    await user.click(await screen.findByRole("button", { name: "Disable Unlock alerts" }));

    expect(setWorkflowEnabled).toHaveBeenCalledWith(workflow.id, false);
    expect(await screen.findByText("Disabled")).toBeInTheDocument();
  });
});
