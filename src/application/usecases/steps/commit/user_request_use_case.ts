/**
 * Use case that performs whatever changes the user asked for (generic request).
 * Uses the configured build agent to edit files and run commands in the workspace.
 * Caller is responsible for permission check and for running commit/push after success.
 */

import { isAgentConfigurationReady } from "../../../../data/model/agent";
import type { FixerQueryPort } from "../../../ports/agent_fixer_ports";
import { getUserRequestPrompt } from "../../../../prompts";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { Result } from "../../../../data/model/result";
import { PROJECT_CONTEXT_INSTRUCTION } from "../../../../utils/project_context_instruction";
import { sanitizeUserCommentForPrompt } from "./bugbot/sanitize_user_comment_for_prompt";
import type { BugbotGitMutationPort } from '../../../ports/bugbot_git_ports';
import type { UserRequestContext } from '../../push_single_action_contexts';
import { finalizeWorkspaceMutation, prepareWorkspaceMutation } from './workspace_mutation_guard';
import { ApplicationError, toApplicationError } from '../../../errors/application_error';

const TASK_ID = "DoUserRequestUseCase";

export interface DoUserRequestParam {
    context: UserRequestContext;
    userComment: string;
    branchOverride?: string;
}

export class DoUserRequestUseCase implements ParamUseCase<DoUserRequestParam, Result[]> {
    taskId: string = TASK_ID;

    constructor(
        private readonly aiRepository: FixerQueryPort,
        private readonly gitCommitPort: BugbotGitMutationPort,
    ) {}

    async invoke(param: DoUserRequestParam): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const results: Result[] = [];
        const { context, userComment } = param;

        if (!isAgentConfigurationReady(context.agentConfiguration)) {
            logInfo("Agent not configured; skipping user request.");
            return results;
        }

        const commentTrimmed = userComment?.trim() ?? "";
        if (!commentTrimmed) {
            logInfo("No user comment; skipping user request.");
            return results;
        }

        const targetBranch = param.branchOverride ?? context.headBranch;
        let mutation;
        try {
            mutation = await prepareWorkspaceMutation(this.gitCommitPort, {
                operation: 'User-request implementation',
                branch: targetBranch,
            });
        } catch (error) {
            return [failure(error)];
        }

        const prompt = getUserRequestPrompt({
            projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
            owner: context.repository.owner,
            repo: context.repository.name,
            headBranch: context.headBranch,
            baseBranch: context.baseBranch,
            issueNumber: String(context.issueNumber),
            userComment: sanitizeUserCommentForPrompt(userComment),
        });

        logDebugInfo(`DoUserRequest: prompt length=${prompt.length}, user comment length=${commentTrimmed.length}.`);
        logInfo("Running configured build agent to perform user request (changes applied in workspace).");
        const response = await this.aiRepository.fix({
            configuration: context.agentConfiguration,
            prompt,
        });

        logDebugInfo(`DoUserRequest: build agent response length=${response?.text?.length ?? 0}.`);

        if (!response?.text) {
            logError("DoUserRequest: no response from configured build agent.");
            results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    errors: [new ApplicationError('agent.failed', "Configured build agent returned no response.")],
                })
            );
            return results;
        }

        let workspacePaths: string[];
        try {
            ({ workspacePaths } = await finalizeWorkspaceMutation(
                this.gitCommitPort,
                mutation.workspacePathsBefore,
                'User-request implementation',
            ));
        } catch (error) {
            return [failure(error)];
        }

        results.push(new Result({
            id: this.taskId,
            success: true,
            executed: true,
            steps: [],
            payload: {
                branchOverride: param.branchOverride,
                branchCheckedOut: mutation.branchCheckedOut,
                workspacePaths,
            },
        }));
        return results;
    }
}

function failure(error: unknown): Result {
    const semanticError = toApplicationError(error, 'workflow.failed', 'User-request implementation failed.');
    logError(semanticError);
    return new Result({
        id: TASK_ID,
        success: false,
        executed: true,
        errors: [semanticError],
    });
}
