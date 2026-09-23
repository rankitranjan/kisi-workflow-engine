import type { Workflow } from "@kisi-workflow/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { deleteWorkflow, formatApiError, listWorkflows, setWorkflowEnabled } from "../api/client";

export function WorkflowList() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [requestId, setRequestId] = useState(0);

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
    } catch (err: unknown) {
      setError(formatApiError(err));
    }
  }

  async function onToggle(workflow: Workflow) {
    try {
      const updated = await setWorkflowEnabled(workflow.id, !workflow.enabled);
      setWorkflows((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err: unknown) {
      setError(formatApiError(err));
    }
  }

  return (
    <main>
      <header className="page-header">
        <h1>Workflows</h1>
        <Link to="/workflows/new">Create workflow</Link>
      </header>
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
      {!loading && error === undefined ? (
        <ul className="workflow-list">
          {workflows.map((workflow) => (
            <li key={workflow.id}>
              <span className="workflow-name">{workflow.name}</span>
              <span>{workflow.enabled ? "Enabled" : "Disabled"}</span>
              <span className="workflow-actions">
                <Link to={`/workflows/${workflow.id}`} aria-label={`Edit ${workflow.name}`}>
                  Edit
                </Link>
                <button
                  type="button"
                  aria-label={`${workflow.enabled ? "Disable" : "Enable"} ${workflow.name}`}
                  onClick={() => void onToggle(workflow)}
                >
                  {workflow.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${workflow.name}`}
                  onClick={() => void onDelete(workflow)}
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
