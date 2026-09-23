import {
  WORKFLOW_NAME_MAX,
  WorkflowCreateSchema,
  WorkflowDefinitionSchema,
  WorkflowNameSchema,
  WorkflowPutSchema,
  type WorkflowCreate,
  type WorkflowDefinition,
  type WorkflowPut,
} from "@kisi-workflow/shared";

export type FormErrors = {
  name?: string;
  steps?: string;
};

export type StepsValidation =
  | { ok: true; steps: WorkflowDefinition }
  | { ok: false; message: string };

type FormInput = {
  name: string;
  enabled: boolean;
  stepsText: string;
};

export function validateStepsText(text: string): StepsValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, message: "Steps must be valid JSON." };
  }

  const result = WorkflowDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "steps";
        return `${path}: ${issue.message}`;
      })
      .join("\n");
    return { ok: false, message };
  }

  return { ok: true, steps: result.data };
}

function nameError(name: string): string | undefined {
  const result = WorkflowNameSchema.safeParse(name);
  if (result.success) {
    return undefined;
  }
  if (name.trim().length === 0) {
    return "Enter a name.";
  }
  if (name.trim().length > WORKFLOW_NAME_MAX) {
    return `Name must be ${WORKFLOW_NAME_MAX} characters or fewer.`;
  }
  return result.error.issues[0]?.message ?? "Enter a name.";
}

function validateFields(input: FormInput): { errors: FormErrors; steps?: WorkflowDefinition } {
  const errors: FormErrors = {};
  const invalidName = nameError(input.name);
  if (invalidName !== undefined) {
    errors.name = invalidName;
  }

  const stepsResult = validateStepsText(input.stepsText);
  if (!stepsResult.ok) {
    errors.steps = stepsResult.message;
    return { errors };
  }
  if (invalidName !== undefined) {
    return { errors };
  }
  return { errors, steps: stepsResult.steps };
}

export function validateCreateForm(
  input: FormInput,
): { ok: true; body: WorkflowCreate } | { ok: false; errors: FormErrors } {
  const fields = validateFields(input);
  if (fields.steps === undefined) {
    return { ok: false, errors: fields.errors };
  }

  const parsed = WorkflowCreateSchema.safeParse({
    name: input.name,
    enabled: input.enabled,
    steps: fields.steps,
  });
  if (!parsed.success) {
    return { ok: false, errors: { steps: "The workflow is invalid." } };
  }
  return { ok: true, body: parsed.data };
}

export function validateReplaceForm(
  input: FormInput,
): { ok: true; body: WorkflowPut } | { ok: false; errors: FormErrors } {
  const fields = validateFields(input);
  if (fields.steps === undefined) {
    return { ok: false, errors: fields.errors };
  }

  const parsed = WorkflowPutSchema.safeParse({
    name: input.name,
    enabled: input.enabled,
    steps: fields.steps,
  });
  if (!parsed.success) {
    return { ok: false, errors: { steps: "The workflow is invalid." } };
  }
  return { ok: true, body: parsed.data };
}
