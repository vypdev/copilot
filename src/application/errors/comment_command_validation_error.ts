import type { CopilotCommandValidationDiagnostic } from '../../domain/copilot_command_validation';
import { ApplicationError } from './application_error';

/** Select reviewed recovery copy using bounded facts; never publish the original command. */
export function commentCommandValidationError(
  reason: string,
  validation?: CopilotCommandValidationDiagnostic,
): ApplicationError {
  return new ApplicationError('validation.invalid-input', reason, validation
    ? { recovery: { id: validation.reason, variables: { command: validation.command } } }
    : {});
}
