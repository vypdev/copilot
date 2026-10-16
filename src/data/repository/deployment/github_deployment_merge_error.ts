import { DeploymentMergeEffectError, type DeploymentMergeAction } from "../../../application/errors/deployment_merge_effect_error";
import type { ApplicationErrorCode } from "../../../application/errors/application_error";

/** Never copy provider messages, request objects, headers, or arbitrary error types into public state. */
export function githubDeploymentMergeError(action: DeploymentMergeAction, cause: unknown): DeploymentMergeEffectError {
  const value = isRecord(cause) ? cause : {};
  const status = typeof value.status === "number" && Number.isInteger(value.status)
    && value.status >= 100 && value.status <= 599 ? value.status : undefined;
  const rawErrors = Array.isArray(value.errors) ? value.errors : [];
  const errors = rawErrors.filter(isRecord);
  const types = errors.map((error) => error.type);
  const denied = status === 401 || status === 403 || types.includes("FORBIDDEN") || types.includes("UNAUTHORIZED");
  const limited = status === 429 || types.includes("RATE_LIMITED");
  const unavailable = (status !== undefined && status >= 500) || types.includes("INTERNAL") || types.includes("SERVICE_UNAVAILABLE");
  const cleanRejection = rawErrors.length === 1 && errors.length === 1 && errors[0].type === "UNPROCESSABLE"
    && errors[0].message === "Pull request is in clean status";
  const readinessChanged = !denied && !limited && !unavailable
    && ((action === "merge" && status === 405) || (action === "enable-auto-merge" && (status === undefined || status === 200) && cleanRejection));
  const code: ApplicationErrorCode = denied ? "authorization.denied"
    : limited ? "provider.rate-limited"
    : unavailable ? "provider.unavailable"
    : status === 404 || types.includes("NOT_FOUND") ? "provider.not-found"
    : status !== undefined || types.length > 0 ? "provider.conflict" : "workflow.failed";
  const reason = readinessChanged ? "readiness-changed" : code;
  const http = status === undefined ? "" : `; HTTP ${status}`;
  return new DeploymentMergeEffectError(action, readinessChanged, code,
    `GitHub rejected ${action} (${reason}${http}).`, cause);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
