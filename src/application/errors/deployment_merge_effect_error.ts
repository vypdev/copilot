import { ApplicationError, type ApplicationErrorCode } from "./application_error";

export type DeploymentMergeAction = "merge" | "enable-auto-merge";

/** Semantic effect failure. Only a confirmed readiness rejection permits one new inspection. */
export class DeploymentMergeEffectError extends ApplicationError {
  constructor(
    readonly action: DeploymentMergeAction,
    readonly readinessChanged: boolean,
    code: ApplicationErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(code, message, { cause });
  }
}
