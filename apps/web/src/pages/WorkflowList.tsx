import type { Workflow } from "@kisi-workflow/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { deleteWorkflow, formatApiError, listWorkflows, setWorkflowEnabled } from "../api/client";
import { useToast } from "../components/toast";

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 12h8l1-12" />
    </svg>
  );
}

export function WorkflowList() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [requestId, setRequestId] = useState(0);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    void listWorkflows()
      .then((next) => {
        if (!cancelled) {
          setWorkflows(next);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(formatApiError(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  async function onDelete(workflow: Workflow) {
    const confirmed = window.confirm(`Delete ${workflow.name}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    try {
      await deleteWorkflow(workflow.id);
      setWorkflows((current) => current.filter((item) => item.id !== workflow.id));
      showToast("Workflow deleted successfully", "success");
    } catch {
      showToast("Failed to delete workflow", "error");
    }
  }

  async function onToggle(workflow: Workflow) {
    try {
      const updated = await setWorkflowEnabled(workflow.id, !workflow.enabled);
      setWorkflows((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      showToast(updated.enabled ? "Workflow enabled" : "Workflow disabled", "success");
    } catch {
      showToast("Failed to update workflow", "error");
    }
  }

  async function onCopy(workflow: Workflow) {
    try {
      await navigator.clipboard.writeText(workflow.triggerUrl);
      showToast("Trigger URL copied", "success");
    } catch {
      showToast("Failed to copy trigger URL", "error");
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Workflows</h1>
          <p className="lede">Create and manage HTTP-triggered workflows.</p>
        </div>
        <Link className="button button-primary" to="/workflows/new">
          Create Workflow
        </Link>
      </header>
      <section className="panel">
        {loading ? <p>Loading workflows...</p> : null}
        {error !== undefined ? (
          <p role="alert">
            {error}{" "}
            <button type="button" onClick={() => setRequestId((value) => value + 1)}>
              Retry
            </button>
          </p>
        ) : null}
        {!loading && error === undefined && workflows.length === 0 ? <p>No workflows yet</p> : null}
        {!loading && error === undefined && workflows.length > 0 ? (
          <table className="workflow-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Trigger URL</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((workflow) => (
                <tr key={workflow.id}>
                  <td data-label="Name">
                    <span className="workflow-name">{workflow.name}</span>
                  </td>
                  <td data-label="Status">
                    <button
                      type="button"
                      className={workflow.enabled ? "status status-enabled" : "status status-disabled"}
                      aria-label={`${workflow.enabled ? "Disable" : "Enable"} ${workflow.name}`}
                      onClick={() => void onToggle(workflow)}
                    >
                      <span className="status-dot" aria-hidden="true" />
                      {workflow.enabled ? "Enabled" : "Disabled"}
                    </button>
                  </td>
                  <td data-label="Trigger URL">
                    <span className="url-pill" title={workflow.triggerUrl}>
                      {workflow.triggerUrl}
                    </span>
                  </td>
                  <td data-label="Actions">
                    <span className="workflow-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Copy trigger URL for ${workflow.name}`}
                        onClick={() => void onCopy(workflow)}
                      >
                        <CopyIcon />
                      </button>
                      <Link
                        className="icon-button"
                        to={`/workflows/${workflow.id}`}
                        aria-label={`Edit ${workflow.name}`}
                      >
                        <EditIcon />
                      </Link>
                      <button
                        type="button"
                        className="icon-button icon-button-danger"
                        aria-label={`Delete ${workflow.name}`}
                        onClick={() => void onDelete(workflow)}
                      >
                        <DeleteIcon />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </main>
  );
}
