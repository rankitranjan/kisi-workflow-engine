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
import { validateCreateForm, validateReplaceForm } from "../validation";

export function WorkflowEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === undefined;

  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [stepsText, setStepsText] = useState("[]");
  const [triggerUrl, setTriggerUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(id !== undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [copyError, setCopyError] = useState<string | undefined>(undefined);

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
    } catch (error: unknown) {
      setSaveError(formatApiError(error));
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
      setCopyError(undefined);
    } catch {
      setCopyError("Could not copy the trigger URL.");
    }
  }

  return (
    <main>
      <p>
        <Link to="/">Workflows</Link>
      </p>
      <h1>{isNew ? "Create workflow" : "Edit workflow"}</h1>
      {loading ? <p>Loading workflow...</p> : null}
      {loadError !== undefined ? (
        <p role="alert">
          {loadError} <Link to="/">Back to workflows</Link>
        </p>
      ) : null}
      {!loading && loadError === undefined ? (
        <form onSubmit={(event) => void onSubmit(event)}>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          {!validation.ok && validation.errors.name !== undefined ? (
            <p role="alert">{validation.errors.name}</p>
          ) : null}
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Enabled
          </label>
          <label htmlFor="workflow-steps">Steps</label>
          <JsonEditor value={stepsText} onChange={setStepsText} />
          {!validation.ok && validation.errors.steps !== undefined ? (
            <p role="alert">{validation.errors.steps}</p>
          ) : null}
          {isNew ? <p>The trigger URL is assigned when you save.</p> : null}
          {!isNew && triggerUrl !== undefined ? (
            <div className="trigger-url">
              <label htmlFor="trigger-url">Trigger URL</label>
              <input id="trigger-url" readOnly value={triggerUrl} />
              <button type="button" onClick={() => void onCopy()}>
                Copy
              </button>
            </div>
          ) : null}
          {copyError !== undefined ? <p role="alert">{copyError}</p> : null}
          {saveError !== undefined ? <p role="alert">{saveError}</p> : null}
          <button type="submit" disabled={!validation.ok || saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      ) : null}
    </main>
  );
}
