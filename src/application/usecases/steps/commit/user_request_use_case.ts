/**
 * Use case that performs whatever changes the user asked for (generic request).
 * Uses the configured build agent to edit files and run commands in the workspace.
 * Caller is responsible for permission check and for running commit/push after success.
 */

import { isAgentConfigurationReady } from "../../../../data/model/agent";
import type { Execution } from "../../../../data/model/execution";
import type { FixerQueryPort } from "../../../ports/agent_fixer_ports";
import { getUserRequestPrompt } from "../../../../prompts";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { Result } from "../../../../data/model/result";
import { PROJECT_CONTEXT_INSTRUCTION } from "../../../../utils/project_context_instruction";
import { sanitizeUserCommentForPrompt } from "./bugbot/sanitize_user_comment_for_prompt";

const TASK_ID = "DoUserRequestUseCase";

export interface DoUserRequestParam {
    execution: Execution;
    userComment: string;
    branchOverride?: string;
}

export class DoUserRequestUseCase implements ParamUseCase<DoUserRequestParam, Result[]> {
    taskId: string = TASK_ID;

    constructor(private readonly aiRepository: FixerQueryPort) {}

    async invoke(param: DoUserRequestParam): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const results: Result[] = [];
        const { execution, userComment } = param;

        if (!isAgentConfigurationReady(execution.ai?.getAgentConfiguration('fixer'))) {
            logInfo("Agent not configured; skipping user request.");
            return results;
        }

        const commentTrimmed = userComment?.trim() ?? "";
        if (!commentTrimmed) {
            logInfo("No user comment; skipping user request.");
            return results;
        }

        const baseBranch =
            execution.currentConfiguration.parentBranch ?? execution.branches.development ?? "develop";
        const prompt = getUserRequestPrompt({
            projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
            owner: execution.owner,
            repo: execution.repo,
            headBranch: execution.commit.branch,
            baseBranch,
            issueNumber: String(execution.issueNumber),
            userComment: sanitizeUserCommentForPrompt(userComment),
        });

        logDebugInfo(`DoUserRequest: prompt length=${prompt.length}, user comment length=${commentTrimmed.length}.`);
        logInfo("Running configured build agent to perform user request (changes applied in workspace).");
        const response = await this.aiRepository.fix({
            configuration: execution.ai?.getAgentConfiguration('fixer'),
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
                    errors: ["Configured build agent returned no response."],
                })
            );
            return results;
        }

        results.push(
            new Result({
                id: this.taskId,
                success: true,
                executed: true,
                steps: [],
                payload: { branchOverride: param.branchOverride },
            })
        );
        return results;
    }
}
