import type { WorkflowStepType } from "@kisi-workflow/shared";

export class EngineValidationError extends Error {
  constructor() {
    super("invalid workflow execution input");
    this.name = "EngineValidationError";
  }
}

export class StepFailedError extends Error {
  readonly stepType: WorkflowStepType;
  readonly httpStatus: number | undefined;

  constructor(stepType: WorkflowStepType, message: string, httpStatus?: number) {
    super(message);
    this.name = "StepFailedError";
    this.stepType = stepType;
    this.httpStatus = httpStatus;
  }
}
