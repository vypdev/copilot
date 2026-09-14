import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logDebugInfo, logError, logInfo } from "../ports/logging_ports";
import { getTaskEmoji } from "../../utils/task_emoji";
import { ParamUseCase } from "./base/param_usecase";
import type { ActorAuthorizationPort } from "../ports/actor_authorization_ports";
import { toApplicationError } from "../errors/application_error";
import type { BugbotReviewOperationContext } from './steps/commit/bugbot/bugbot_review_operation_context';
import { projectBugbotReviewOperationContext } from './steps/commit/bugbot/bugbot_review_operation_context';
import {
    projectChangeSizeContext,
    projectCommitNotificationContext,
    projectProgressContext,
    type ChangeSizeContext,
    type CommitNotificationContext,
    type ProgressContext,
} from './push_single_action_contexts';

export class CommitUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'CommitUseCase';

    constructor(
        private readonly notifyNewCommitUseCase: ParamUseCase<CommitNotificationContext, Result[]>,
        private readonly checkChangesIssueSizeUseCase: ParamUseCase<ChangeSizeContext, Result[]>,
        private readonly detectPotentialProblemsUseCase: ParamUseCase<BugbotReviewOperationContext, Result[]>,
        private readonly checkProgressUseCase: ParamUseCase<ProgressContext, Result[]>,
        private readonly actorAuthorizationPort?: ActorAuthorizationPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const results: Result[] = [];
        try {
            if (param.commit.commits.length === 0) {
                logDebugInfo('No commits found in this push.');
                return results;
            }

            logDebugInfo(`Branch: ${param.commit.branch}`);
            logDebugInfo(`Commits detected: ${param.commit.commits.length}`);
            logDebugInfo(`Issue number: ${param.issueNumber}`);

            results.push(...(await this.notifyNewCommitUseCase.invoke(projectCommitNotificationContext(param))));
            results.push(...(await this.checkChangesIssueSizeUseCase.invoke(projectChangeSizeContext(param))));
            const agentAllowed = !param.ai.getAiMembersOnly()
                || Boolean(this.actorAuthorizationPort && await this.actorAuthorizationPort.isActorAllowedToModifyFiles(
                    param.owner,
                    param.repo,
                    param.actor,
                    param.tokens.token,
                ));
            if (agentAllowed) {
                results.push(...(await this.checkProgressUseCase.invoke(projectProgressContext(param))));
                if (param.pullRequest.number > 0) {
                    logInfo(
                        `Skipping push Bugbot analysis because pull request #${param.pullRequest.number} owns review for this head.`,
                    );
                } else {
                    results.push(...(await this.detectPotentialProblemsUseCase.invoke(
                        projectBugbotReviewOperationContext(param),
                    )));
                }
            } else {
                logInfo('Skipping push agent analysis because ai-members-only is enabled and the actor is not authorized.');
            }
        } catch (error) {
            const semanticError = toApplicationError(error, 'workflow.failed', 'Commit processing failed.');
            logError(semanticError);
            results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Error processing the commits.`,
                    ],
                    errors: [semanticError],
                })
            )
        }
        return results;
    }
}
