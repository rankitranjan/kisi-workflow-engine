import { listWorkflows, readDemoAccessKey } from "./api/client";
import { App } from "./App";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api/client", async () => {
  const actual = await vi.importActual<typeof import("./api/client")>("./api/client");
  return {
    ...actual,
    listWorkflows: vi.fn(),
    readDemoAccessKey: vi.fn(() => "demo-access-key"),
  };
});

describe("App", () => {
  beforeEach(() => {
    vi.mocked(listWorkflows).mockReset();
    vi.mocked(readDemoAccessKey).mockReset();
    vi.mocked(readDemoAccessKey).mockReturnValue("demo-access-key");
  });

  it("shows a configuration error and does not load workflows when the demo credential is missing", () => {
    vi.mocked(readDemoAccessKey).mockReturnValue(undefined);
    render(<App />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The demo access credential is not configured",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("not a secret");
    expect(listWorkflows).not.toHaveBeenCalled();
  });
});
