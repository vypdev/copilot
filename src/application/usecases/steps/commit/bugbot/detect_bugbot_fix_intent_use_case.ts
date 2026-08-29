import { isAgentConfigurationReady } from "../../../../../data/model/agent";
import type { Execution } from "../../../../../data/model/execution";
import { AGENT_PLAN } from "../../../../../application/policies/agent_task_policy";
import type { FindingsQueryPort } from "../../../../ports/agent_findings_ports";
import type { BugbotContextPorts } from "../../../../../application/ports/bugbot_context_ports";
import type { BugbotPullRequestQueryPort } from "../../../../../application/ports/bugbot_pull_request_read_ports";
import { logDebugInfo, logInfo } from "../../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../../utils/task_emoji";
import { ParamUseCase } from "../../../base/param_usecase";
import { Result } from "../../../../../data/model/result";
import { buildBugbotFixIntentPrompt } from "./build_bugbot_fix_intent_prompt";
import { loadBugbotContext, type LoadBugbotContextOptions } from "./load_bugbot_context_use_case";
import { BUGBOT_FIX_INTENT_RESPONSE_SCHEMA } from "./schema";
import {
    buildUnresolvedFindingSummaries,
    parseBugbotFixIntentResponse,
    selectBugbotCommentBody,
} from "./detect_bugbot_fix_intent_policy";
import type { BugbotFixIntent } from "./detect_bugbot_fix_intent_policy";

const TASK_ID = "DetectBugbotFixIntentUseCase";

/**
 * Asks the configured findings agent whether the user comment is a request to fix one or more
 * bugbot findings, and which finding ids to target. Used from issue comments and PR
 * review comments. When isFixRequest is true and targetFindingIds is non-empty, the
 * caller (IssueCommentUseCase / PullRequestReviewCommentUseCase) runs the autofix flow.
 * Requires unresolved findings (from loadBugbotContext); otherwise we skip and return empty.
 */
export class DetectBugbotFixIntentUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = TASK_ID;

    constructor(
        private readonly pullRequestQueryPort: BugbotPullRequestQueryPort,
        private readonly aiRepository: FindingsQueryPort,
        private readonly contextPorts: BugbotContextPorts,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const results: Result[] = [];

        if (!isAgentConfigurationReady(param.ai?.getAgentConfiguration('findings'))) {
            logInfo("Agent not configured; skipping bugbot fix intent detection.");
            return results;
        }

        if (param.issueNumber === -1) {
            logInfo("No issue number; skipping bugbot fix intent detection.");
            return results;
        }

        const commentBody = selectBugbotCommentBody(param);
        if (!commentBody?.trim()) {
            logInfo("No comment body; skipping bugbot fix intent detection.");
            return results;
        }

        // On issue_comment event we may not have commit.branch; resolve from an open PR that references the issue.
        let branchOverride: string | undefined;
        if (!param.commit.branch?.trim()) {
            branchOverride = await this.pullRequestQueryPort.getHeadBranchForIssue(
                param.owner,
                param.repo,
                param.issueNumber,
                param.tokens.token
            );
            if (!branchOverride) {
                logInfo("Could not resolve branch for issue; skipping bugbot fix intent detection.");
                return results;
            }
        }

        const options: LoadBugbotContextOptions | undefined = branchOverride
            ? { branchOverride }
            : undefined;
        const context = await loadBugbotContext(param, options, this.contextPorts);

        const unresolvedWithBody = context.unresolvedFindingsWithBody ?? [];
        if (unresolvedWithBody.length === 0) {
            logInfo(
                "No unresolved bugbot findings for this issue/PR; skipping bugbot fix intent detection."
            );
            return results;
        }

        const unresolvedIds = new Set(unresolvedWithBody.map((finding) => finding.id));
        const unresolvedFindings = buildUnresolvedFindingSummaries(unresolvedWithBody);

        // When user replied in a PR thread, include parent comment so the agent knows which finding they mean.
        let parentCommentBody: string | undefined;
        if (param.pullRequest.isPullRequestReviewComment && param.pullRequest.commentInReplyToId) {
            const prNumber = param.pullRequest.number;
            const parentBody = await this.pullRequestQueryPort.getPullRequestReviewCommentBody(
                param.owner,
                param.repo,
                prNumber,
                param.pullRequest.commentInReplyToId,
                param.tokens.token
            );
            parentCommentBody = parentBody ?? undefined;
        }

        const prompt = buildBugbotFixIntentPrompt(commentBody, unresolvedFindings, parentCommentBody);

        logDebugInfo(`DetectBugbotFixIntent: prompt length=${prompt.length}, unresolved findings=${unresolvedFindings.length}. Calling configured findings agent.`);
        const response = await this.aiRepository.query({
            configuration: param.ai?.getAgentConfiguration('findings'),
            agentId: AGENT_PLAN,
            prompt,
            options: {
                expectJson: true,
                schema: BUGBOT_FIX_INTENT_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
                schemaName: 'bugbot_fix_intent',
            },
        });

        const intent = parseBugbotFixIntentResponse(response, unresolvedIds);
        if (!intent) {
            logInfo("No response from configured agent for fix intent.");
            results.push(
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: true,
                    steps: ["Bugbot fix intent: no response; skipping autofix."],
                    payload: { isFixRequest: false, isDoRequest: false, targetFindingIds: [] as string[] },
                })
            );
            return results;
        }

        logDebugInfo(`DetectBugbotFixIntent: agent payload is_fix_request=${intent.isFixRequest}, is_do_request=${intent.isDoRequest}, target_finding_ids=${JSON.stringify(intent.targetFindingIds)}.`);

        results.push(
            new Result({
                id: this.taskId,
                success: true,
                executed: true,
                steps: [],
                payload: {
                    ...intent,
                    context,
                    branchOverride,
                } as BugbotFixIntent & { context?: typeof context; branchOverride?: string },
            })
        );
        return results;
    }
}
