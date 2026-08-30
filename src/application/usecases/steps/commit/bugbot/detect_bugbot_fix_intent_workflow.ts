import { isAgentConfigurationReady } from "../../../../../data/model/agent";
import type { Execution } from "../../../../../data/model/execution";
import { AGENT_PLAN } from "../../../../../application/policies/agent_task_policy";
import type { FindingsQueryPort } from "../../../../ports/agent_findings_ports";
import type { BugbotContextPorts } from "../../../../../application/ports/bugbot_context_ports";
import type { BugbotPullRequestQueryPort } from "../../../../../application/ports/bugbot_pull_request_read_ports";
import { logDebugInfo, logInfo } from "../../../../ports/logging_ports";
import { Result } from "../../../../../data/model/result";
import { parseCopilotCommand } from '../../../../../domain/copilot_command';
import { buildBugbotFixIntentPrompt } from "./build_bugbot_fix_intent_prompt";
import { loadBugbotContext, type LoadBugbotContextOptions } from "./load_bugbot_context_use_case";
import { BUGBOT_FIX_INTENT_RESPONSE_SCHEMA } from "./schema";
import {
  buildUnresolvedFindingSummaries,
  parseBugbotFixIntentResponse,
  selectBugbotCommentBody,
  type BugbotFixIntent,
} from "./detect_bugbot_fix_intent_policy";

const TASK_ID = "DetectBugbotFixIntentUseCase";

export interface DetectBugbotFixIntentWorkflowPorts {
  pullRequestQueryPort: BugbotPullRequestQueryPort;
  aiRepository: FindingsQueryPort;
  contextPorts: BugbotContextPorts;
}

/** Detects whether a comment targets Bugbot findings and returns the validated intent payload. */
export async function runDetectBugbotFixIntentWorkflow(
  param: Execution,
  ports: DetectBugbotFixIntentWorkflowPorts,
): Promise<Result[]> {
  const results: Result[] = [];

  if (param.issueNumber === -1) {
    logInfo("No issue number; skipping bugbot fix intent detection.");
    return results;
  }

  const commentBody = selectBugbotCommentBody(param);
  if (!commentBody?.trim()) {
    logInfo("No comment body; skipping bugbot fix intent detection.");
    return results;
  }

  const explicitCommand = parseCopilotCommand(commentBody);
  const isExplicitFix = explicitCommand.kind === 'command' && explicitCommand.command.name === 'fix';
  if (!isExplicitFix && !isAgentConfigurationReady(param.ai?.getAgentConfiguration("findings"))) {
    logInfo("Agent not configured; skipping bugbot fix intent detection.");
    return results;
  }

  const branchOverride = await resolveBranchOverride(param, ports.pullRequestQueryPort);
  if (branchOverride === null) {
    logInfo("Could not resolve branch for issue; skipping bugbot fix intent detection.");
    return results;
  }

  const contextOptions: LoadBugbotContextOptions | undefined = branchOverride
    ? { branchOverride }
    : undefined;
  const context = await loadBugbotContext(param, contextOptions, ports.contextPorts);
  const unresolvedWithBody = context.unresolvedFindingsWithBody ?? [];
  if (unresolvedWithBody.length === 0) {
    logInfo("No unresolved bugbot findings for this issue/PR; skipping bugbot fix intent detection.");
    return results;
  }

  const unresolvedIds = new Set(unresolvedWithBody.map((finding) => finding.id));
  const unresolvedFindings = buildUnresolvedFindingSummaries(unresolvedWithBody);
  const parentCommentBody = await resolveParentCommentBody(param, ports.pullRequestQueryPort);
  if (explicitCommand.kind === 'command' && explicitCommand.command.name === 'fix') {
    const requestedIds = explicitCommand.command.arguments.includes('all')
      ? [...unresolvedIds]
      : explicitCommand.command.arguments.filter(id => unresolvedIds.has(id));
    results.push(new Result({
      id: TASK_ID,
      success: true,
      executed: true,
      steps: [`Explicit fix command selected ${requestedIds.length} unresolved finding(s) without model intent detection.`],
      payload: {
        isFixRequest: requestedIds.length > 0,
        isDoRequest: false,
        targetFindingIds: [...new Set(requestedIds)],
        context,
        branchOverride,
      } as BugbotFixIntent & { context?: typeof context; branchOverride?: string },
    }));
    return results;
  }

  const prompt = buildBugbotFixIntentPrompt(commentBody, unresolvedFindings, parentCommentBody);

  logDebugInfo(
    `DetectBugbotFixIntent: prompt length=${prompt.length}, unresolved findings=${unresolvedFindings.length}. Calling configured findings agent.`,
  );
  const response = await ports.aiRepository.query({
    configuration: param.ai?.getAgentConfiguration("findings"),
    agentId: AGENT_PLAN,
    prompt,
    options: {
      expectJson: true,
      schema: BUGBOT_FIX_INTENT_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      schemaName: "bugbot_fix_intent",
    },
  });

  const intent = parseBugbotFixIntentResponse(response, unresolvedIds);
  if (!intent) {
    logInfo("No response from configured agent for fix intent.");
    results.push(
      new Result({
        id: TASK_ID,
        success: true,
        executed: true,
        steps: ["Bugbot fix intent: no response; skipping autofix."],
        payload: { isFixRequest: false, isDoRequest: false, targetFindingIds: [] as string[] },
      }),
    );
    return results;
  }

  logDebugInfo(
    `DetectBugbotFixIntent: agent payload is_fix_request=${intent.isFixRequest}, is_do_request=${intent.isDoRequest}, target_finding_ids=${JSON.stringify(intent.targetFindingIds)}.`,
  );
  results.push(
    new Result({
      id: TASK_ID,
      success: true,
      executed: true,
      steps: [],
      payload: {
        ...intent,
        context,
        branchOverride,
      } as BugbotFixIntent & { context?: typeof context; branchOverride?: string },
    }),
  );
  return results;
}

async function resolveBranchOverride(
  param: Execution,
  pullRequestQueryPort: BugbotPullRequestQueryPort,
): Promise<string | undefined | null> {
  if (param.commit.branch?.trim()) return undefined;
  const branch = await pullRequestQueryPort.getHeadBranchForIssue(
    param.owner,
    param.repo,
    param.issueNumber,
    param.tokens.token,
  );
  return branch || null;
}

async function resolveParentCommentBody(
  param: Execution,
  pullRequestQueryPort: BugbotPullRequestQueryPort,
): Promise<string | undefined> {
  if (!param.pullRequest.isPullRequestReviewComment || !param.pullRequest.commentInReplyToId) {
    return undefined;
  }
  const parentBody = await pullRequestQueryPort.getPullRequestReviewCommentBody(
    param.owner,
    param.repo,
    param.pullRequest.number,
    param.pullRequest.commentInReplyToId,
    param.tokens.token,
  );
  return parentBody ?? undefined;
}
