import { isAgentConfigurationReady } from "../../../../../data/model/agent";
import type { Execution } from "../../../../../data/model/execution";
import type { FixerQueryPort } from "../../../../ports/agent_fixer_ports";
import type { BugbotContextPorts } from "../../../../../application/ports/bugbot_context_ports";
import type { GitCommitPort } from "../../../../../application/ports/git_ports";
import { logDebugInfo, logError, logInfo } from "../../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../../utils/task_emoji";
import { ParamUseCase } from "../../../base/param_usecase";
import { Result } from "../../../../../data/model/result";
import {
    isExistingFindingFullyResolved,
    type BugbotContext,
} from "./types";
import { buildBugbotFixPrompt } from "./build_bugbot_fix_prompt";
import { loadBugbotContext } from "./load_bugbot_context_use_case";
import { listWorkspacePaths, isSensitiveWorkspacePath, selectWorkspacePathsToCommit } from "./workspace_changes";

const TASK_ID = "BugbotAutofixUseCase";

/**
 * Runs the configured build agent to fix the selected bugbot findings. The agent edits files
 * directly in the workspace (we do not pass or apply diffs). Caller must run verify commands
 * and commit/push after success (see runBugbotAutofixCommitAndPush).
 */

export interface BugbotAutofixParam {
    execution: Execution;
    targetFindingIds: string[];
    userComment: string;
    /** If provided (e.g. from intent step), reuse to avoid reloading. */
    context?: BugbotContext;
    branchOverride?: string;
}

export class BugbotAutofixUseCase implements ParamUseCase<BugbotAutofixParam, Result[]> {
    taskId: string = TASK_ID;

    constructor(
        private readonly aiRepository: FixerQueryPort,
        private readonly contextPorts: BugbotContextPorts,
        private readonly gitCommitPort: GitCommitPort,
    ) {}

    async invoke(param: BugbotAutofixParam): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const results: Result[] = [];
        const { execution, targetFindingIds, userComment, context: providedContext, branchOverride } = param;

        if (targetFindingIds.length === 0) {
            logDebugInfo("No target finding ids; skipping autofix.");
            return results;
        }

        if (!isAgentConfigurationReady(execution.ai?.getAgentConfiguration('fixer'))) {
            logDebugInfo("Agent not configured; skipping autofix.");
            return results;
        }

        const context = providedContext ?? (await loadBugbotContext(
            execution,
            branchOverride ? { branchOverride } : undefined,
            this.contextPorts,
        ));

        let workspacePathsBefore: string[];
        try {
            workspacePathsBefore = await listWorkspacePaths(this.gitCommitPort);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`Bugbot autofix: unable to inspect workspace before agent execution: ${message}`);
            results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    errors: [`Unable to inspect workspace before autofix: ${message}`],
                })
            );
            return results;
        }
        if (workspacePathsBefore.length > 0) {
            logError(`Bugbot autofix refused because workspace is not clean: ${workspacePathsBefore.join(", ")}`);
            results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    errors: ["Bugbot autofix refused: workspace is not clean before agent execution."],
                })
            );
            return results;
        }

        const validIds = new Set(
            Object.entries(context.existingByFindingId)
                .filter(([, info]) => !isExistingFindingFullyResolved(info))
                .map(([id]) => id)
        );
        const idsToFix = targetFindingIds.filter((id) => validIds.has(id));
        if (idsToFix.length === 0) {
            logDebugInfo("No valid unresolved target findings; skipping autofix.");
            return results;
        }

        const verifyCommands = execution.ai.getBugbotFixVerifyCommands?.() ?? [];
        const prompt = buildBugbotFixPrompt(execution, context, idsToFix, userComment, verifyCommands);

        logDebugInfo(`BugbotAutofix: prompt length=${prompt.length}, target finding ids=${idsToFix.length}, verifyCommands=${verifyCommands.length}.`);
        logInfo("Running configured build agent to fix selected findings (changes applied in workspace).");
        const response = await this.aiRepository.fix({
            configuration: execution.ai?.getAgentConfiguration('fixer'),
            prompt,
        });

        logDebugInfo(`BugbotAutofix: build agent response length=${response?.text?.length ?? 0}. Full response:\n${response?.text ?? '(none)'}`);

        if (!response?.text) {
            logError("Bugbot autofix: no response from configured build agent.");
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

        let workspacePathsAfter: string[];
        try {
            workspacePathsAfter = await listWorkspacePaths(this.gitCommitPort);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`Bugbot autofix: unable to inspect workspace after agent execution: ${message}`);
            results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    errors: [`Unable to inspect workspace after autofix: ${message}`],
                })
            );
            return results;
        }
        const unsafeWorkspacePaths = workspacePathsAfter.filter(isSensitiveWorkspacePath);
        if (unsafeWorkspacePaths.length > 0) {
            logError(`Bugbot autofix refused sensitive workspace paths: ${unsafeWorkspacePaths.join(", ")}`);
            results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    errors: [
                        `Bugbot autofix refused because sensitive files were modified: ${unsafeWorkspacePaths.join(", ")}`,
                    ],
                })
            );
            return results;
        }
        const workspacePaths = selectWorkspacePathsToCommit(workspacePathsBefore, workspacePathsAfter);
        if (workspacePaths.length === 0) {
            logError("Bugbot autofix produced no safe workspace paths to commit.");
            results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    errors: ["Bugbot autofix produced no safe workspace paths to commit."],
                })
            );
            return results;
        }

        results.push(
            new Result({
                id: this.taskId,
                success: true,
                executed: true,
                steps: [
                    `Bugbot autofix completed. The configured agent applied changes for findings: ${idsToFix.join(", ")}. Run verify commands and commit/push.`,
                ],
                payload: { targetFindingIds: idsToFix, context, workspacePaths },
            })
        );
        return results;
    }
}
