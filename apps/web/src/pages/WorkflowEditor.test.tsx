import { ApiClientError, createWorkflow, getWorkflow, replaceWorkflow } from "../api/client";
import { sampleWorkflow } from "../test/fixtures";
import { WorkflowEditor } from "./WorkflowEditor";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/JsonEditor", () => ({
  JsonEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Workflow steps"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    getWorkflow: vi.fn(),
    createWorkflow: vi.fn(),
    replaceWorkflow: vi.fn(),
  };
});

const workflow = sampleWorkflow();

function renderEditor(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/workflows/new" element={<WorkflowEditor />} />
        <Route path="/workflows/:id" element={<WorkflowEditor />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillName(name: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Name" }), name);
  return user;
}

describe("WorkflowEditor", () => {
  beforeEach(() => {
    vi.mocked(getWorkflow).mockReset();
    vi.mocked(createWorkflow).mockReset();
    vi.mocked(replaceWorkflow).mockReset();
  });

  it("creates a workflow and then shows the trigger URL from the API", async () => {
    vi.mocked(createWorkflow).mockResolvedValue(workflow);
    vi.mocked(getWorkflow).mockResolvedValue(workflow);
    renderEditor("/workflows/new");

    expect(screen.getByText("The trigger URL is assigned when you save.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Trigger URL" })).not.toBeInTheDocument();

    const user = await fillName("Unlock alerts");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(createWorkflow).toHaveBeenCalledWith({
      name: "Unlock alerts",
      enabled: true,
      steps: [],
    });
    expect(await screen.findByRole("textbox", { name: "Trigger URL" })).toHaveValue(
      workflow.triggerUrl,
    );
  });

  it("sends enabled false when the checkbox is unchecked", async () => {
    vi.mocked(createWorkflow).mockResolvedValue(workflow);
    vi.mocked(getWorkflow).mockResolvedValue(workflow);
    renderEditor("/workflows/new");

    const user = await fillName("Unlock alerts");
    await user.click(screen.getByRole("checkbox", { name: "Enabled" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(createWorkflow).toHaveBeenCalledWith({
      name: "Unlock alerts",
      enabled: false,
      steps: [],
    });
  });

  it("blocks save when the steps JSON is invalid", async () => {
    renderEditor("/workflows/new");
    await fillName("Unlock alerts");
    fireEvent.change(screen.getByRole("textbox", { name: "Workflow steps" }), {
      target: { value: "{" },
    });

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Steps must be valid JSON.")).toBeInTheDocument();
    expect(createWorkflow).not.toHaveBeenCalled();
  });

  it("blocks save when the steps JSON fails the shared schema", async () => {
    renderEditor("/workflows/new");
    await fillName("Unlock alerts");
    fireEvent.change(screen.getByRole("textbox", { name: "Workflow steps" }), {
      target: { value: "{}" },
    });

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("alert").textContent).not.toBe("Steps must be valid JSON.");
    expect(createWorkflow).not.toHaveBeenCalled();
  });

  it("loads a workflow and copies the API trigger URL", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(getWorkflow).mockResolvedValue(workflow);
    renderEditor(`/workflows/${workflow.id}`);

    expect(screen.getByText("Loading workflow...")).toBeInTheDocument();
    expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("Unlock alerts");
    expect(screen.getByRole("checkbox", { name: "Enabled" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Workflow steps" })).toHaveValue("[]");
    expect(screen.getByRole("textbox", { name: "Trigger URL" })).toHaveValue(workflow.triggerUrl);

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(workflow.triggerUrl);
  });

  it("saves edits with PUT and does not send trigger fields", async () => {
    const user = userEvent.setup();
    vi.mocked(getWorkflow).mockResolvedValue(workflow);
    vi.mocked(replaceWorkflow).mockResolvedValue(workflow);
    renderEditor(`/workflows/${workflow.id}`);

    const name = await screen.findByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Renamed alerts");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(replaceWorkflow).toHaveBeenCalledWith(workflow.id, {
      name: "Renamed alerts",
      enabled: true,
      steps: [],
    });
    expect(screen.getByRole("textbox", { name: "Trigger URL" })).toHaveValue(workflow.triggerUrl);
  });

  it("shows not found when the workflow does not exist", async () => {
    vi.mocked(getWorkflow).mockRejectedValue(new ApiClientError({ error: "not_found" }));
    renderEditor(`/workflows/${workflow.id}`);

    expect(await screen.findByText("This workflow was not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to workflows" })).toHaveAttribute("href", "/");
  });

  it("shows a server validation error", async () => {
    const user = userEvent.setup();
    vi.mocked(getWorkflow).mockResolvedValue(workflow);
    vi.mocked(replaceWorkflow).mockRejectedValue(
      new ApiClientError({
        error: "validation_error",
        details: { formErrors: [], fieldErrors: { name: ["too long"] } },
      }),
    );
    renderEditor(`/workflows/${workflow.id}`);

    await user.click(await screen.findByRole("button", { name: "Save" }));

    expect(await screen.findByText("name: too long")).toBeInTheDocument();
  });

  it("shows Saving... while the create request is in flight", async () => {
    let resolveCreate: (value: typeof workflow) => void = () => {};
    vi.mocked(createWorkflow).mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    vi.mocked(getWorkflow).mockResolvedValue(workflow);
    renderEditor("/workflows/new");

    const user = await fillName("Unlock alerts");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    resolveCreate(workflow);
    expect(await screen.findByRole("textbox", { name: "Trigger URL" })).toHaveValue(
      workflow.triggerUrl,
    );
  });
});
