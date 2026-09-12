import type { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";
import { parseBranchSyncCommandArguments } from "../../../domain/branch_sync_command";
import type { ActorAuthorizationPort } from "../../ports/actor_authorization_ports";
import type { CommentAutomationOptions } from "../comment_automation_contracts";
import { ApplicationError } from "../../errors/application_error";

/** Authorizes and runs an explicit or natural-language branch synchronization request. */
export async function runBranchSyncCommand(
  execution: Execution,
  options: CommentAutomationOptions,
  args: readonly string[],
  authorization: ActorAuthorizationPort,
): Promise<Result[]> {
  const parsed = parseBranchSyncCommandArguments(args);
  if (!parsed.valid) return [invalid(options.taskId, parsed.reason)];
  if (!options.syncBranchUseCase) return [unavailable(options.taskId)];

  const allowed = await authorization.isActorAllowedToModifyFiles(
    execution.owner,
    execution.repo,
    execution.actor,
    execution.tokens.token,
  );
  if (!allowed) return [unauthorized(options.taskId)];
  return options.syncBranchUseCase.invoke({ execution, options: parsed.options });
}

function invalid(taskId: string, reason: string): Result {
  return new Result({ id: taskId, success: false, executed: false, errors: [new ApplicationError('validation.invalid-input', reason)] });
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
