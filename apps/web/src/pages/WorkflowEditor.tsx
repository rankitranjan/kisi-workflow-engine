import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import {
  createWorkflow,
  formatApiError,
  getWorkflow,
  replaceWorkflow,
} from "../api/client";
import { JsonEditor } from "../components/JsonEditor";
import { useToast } from "../components/toast";
import { validateCreateForm, validateReplaceForm } from "../validation";

export function WorkflowEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isNew = id === undefined;

  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [stepsText, setStepsText] = useState("[]");
  const [triggerUrl, setTriggerUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(id !== undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id === undefined) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(undefined);
    void getWorkflow(id)
      .then((workflow) => {
        if (cancelled) {
          return;
        }
        setName(workflow.name);
        setEnabled(workflow.enabled);
        setStepsText(JSON.stringify(workflow.steps, null, 2));
        setTriggerUrl(workflow.triggerUrl);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setLoadError(formatApiError(error));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const validation = isNew
    ? validateCreateForm({ name, enabled, stepsText })
    : validateReplaceForm({ name, enabled, stepsText });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }
    setSaving(true);
    setSaveError(undefined);
    try {
      if (isNew) {
        const parsed = validateCreateForm({ name, enabled, stepsText });
        if (!parsed.ok) {
          return;
        }
        const created = await createWorkflow(parsed.body);
        showToast("Workflow created successfully", "success");
        await navigate(`/workflows/${created.id}`);
        return;
      }
      if (id === undefined) {
        return;
      }
      const parsed = validateReplaceForm({ name, enabled, stepsText });
      if (!parsed.ok) {
        return;
      }
      await replaceWorkflow(id, parsed.body);
      showToast("Workflow updated successfully", "success");
    } catch (error: unknown) {
      setSaveError(formatApiError(error));
      showToast("Failed to save workflow", "error");
    } finally {
      setSaving(false);
    }
  }

  async function onCopy() {
    if (triggerUrl === undefined) {
      return;
    }
    try {
      await navigator.clipboard.writeText(triggerUrl);
      showToast("Trigger URL copied", "success");
    } catch {
      showToast("Failed to copy trigger URL", "error");
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>{isNew ? "Create workflow" : "Edit workflow"}</h1>
          <p className="lede">
            {isNew
              ? "Define the steps for a new HTTP-triggered workflow."
              : "Update this workflow and its HTTP trigger."}
          </p>
        </div>
      </header>
      {loading ? <p>Loading workflow...</p> : null}
      {loadError !== undefined ? (
        <p role="alert">
          {loadError} <Link to="/">Back to workflows</Link>
        </p>
      ) : null}
      {!loading && loadError === undefined ? (
        <form className="editor-form" onSubmit={(event) => void onSubmit(event)}>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          {!validation.ok && validation.errors.name !== undefined ? (
            <p role="alert">{validation.errors.name}</p>
          ) : null}
          <label className="switch">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Enabled
          </label>
          <section className="panel">
            <h2>HTTP Trigger</h2>
            {isNew ? <p>The trigger URL is assigned when you save.</p> : null}
            {!isNew && triggerUrl !== undefined ? (
              <div className="trigger-row">
                <span className="method-badge">POST</span>
                <label htmlFor="trigger-url">
                  Trigger URL
                  <input id="trigger-url" readOnly value={triggerUrl} />
                </label>
                <button className="button" type="button" onClick={() => void onCopy()}>
                  Copy
                </button>
              </div>
            ) : null}
          </section>
          <section className="panel">
            <h2>Steps</h2>
            <div className="monaco-frame">
              <JsonEditor value={stepsText} onChange={setStepsText} />
            </div>
            {!validation.ok && validation.errors.steps !== undefined ? (
              <p role="alert">{validation.errors.steps}</p>
            ) : null}
          </section>
          {saveError !== undefined ? <p role="alert">{saveError}</p> : null}
          <button className="button button-primary" type="submit" disabled={!validation.ok || saving}>
            {saving ? "Saving..." : "Save Workflow"}
          </button>
        </form>
      ) : null}
    </main>
  );
}
