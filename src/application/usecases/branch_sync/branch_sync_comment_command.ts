import { commentCommandValidationError } from '../../errors/comment_command_validation_error';
import { Result } from "../../../data/model/result";
import { parseBranchSyncCommandArguments } from "../../../domain/branch_sync_command";
import type { BoundActorAuthorizationPort } from "../../ports/actor_authorization_ports";
import type { CommentAutomationOptions } from "../comment_automation_contracts";
import type { CommentAutomationContext } from '../comment_automation_context';
import { ApplicationError } from "../../errors/application_error";

/** Authorizes and runs an explicit or natural-language branch synchronization request. */
export async function runBranchSyncCommand(
  context: CommentAutomationContext,
  options: CommentAutomationOptions,
  args: readonly string[],
  authorization: BoundActorAuthorizationPort,
): Promise<Result[]> {
  const parsed = parseBranchSyncCommandArguments(args);
  if (!parsed.valid) return [invalid(options.taskId, parsed)];
  if (!options.syncBranchUseCase) return [unavailable(options.taskId)];

  const allowed = await authorization.isActorAllowedToModifyFiles(context.actor);
  if (!allowed) return [unauthorized(options.taskId)];
  return options.syncBranchUseCase.invoke(parsed.options);
}

function invalid(taskId: string, parsed: Extract<ReturnType<typeof parseBranchSyncCommandArguments>, { valid: false }>): Result {
  return new Result({ id: taskId, success: false, executed: false, errors: [commentCommandValidationError(parsed.reason, parsed.validation)] });
}

function unavailable(taskId: string): Result {
  return new Result({
    id: `${taskId}.BranchSync`,
    success: false,
    executed: false,
    errors: [new ApplicationError('configuration.unsupported', "Branch synchronization is not available in this composition.")],
  });
}

function unauthorized(taskId: string): Result {
  return new Result({
    id: `${taskId}.BranchSync`,
    success: true,
    executed: false,
    steps: ["Branch synchronization skipped because the actor is not authorized to modify repository branches."],
  });
}
