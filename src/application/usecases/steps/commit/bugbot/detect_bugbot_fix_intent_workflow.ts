import { isAgentConfigurationReady } from "../../../../../data/model/agent";
import { AGENT_PLAN } from "../../../../../application/policies/agent_task_policy";
import type { FindingsQueryPort } from "../../../../ports/agent_findings_ports";
import type { BugbotContextPorts } from "../../../../../application/ports/bugbot_context_ports";
import { logDebugInfo, logInfo } from "../../../../ports/logging_ports";
import { Result } from "../../../../../data/model/result";
import { parseCopilotCommand } from '../../../../../domain/copilot_command';
import { buildBugbotFixIntentPrompt } from "./build_bugbot_fix_intent_prompt";
import { loadBugbotContext } from "./load_bugbot_context_use_case";
import {
  projectBugbotContextRequest,
  type LoadBugbotContextOptions,
} from "./bugbot_context_request";
import type { BugbotFixIntentContext } from './bugbot_review_operation_context';
import { BUGBOT_FIX_INTENT_RESPONSE_SCHEMA } from "./schema";
import {
  buildUnresolvedFindingSummaries,
  parseBugbotFixIntentResponse,
  type BugbotFixIntent,
} from "./detect_bugbot_fix_intent_policy";

const TASK_ID = "DetectBugbotFixIntentUseCase";

export interface DetectBugbotFixIntentWorkflowPorts {
  aiRepository: FindingsQueryPort;
  contextPorts: BugbotContextPorts;
}

/** Detects whether a comment requests a finding fix, repository change, or read-only review. */
export async function runDetectBugbotFixIntentWorkflow(
  param: BugbotFixIntentContext,
  ports: DetectBugbotFixIntentWorkflowPorts,
): Promise<Result[]> {
  const results: Result[] = [];

  if (param.target.issueNumber <= 0 && param.target.pullRequestNumber <= 0) {
    logInfo("No issue or pull request number; skipping bugbot fix intent detection.");
    return results;
  }

  const commentBody = param.comment.body;
  if (!commentBody?.trim()) {
    logInfo("No comment body; skipping bugbot fix intent detection.");
    return results;
  }

  const explicitCommand = parseCopilotCommand(commentBody);
  const isExplicitFix = explicitCommand.kind === 'command' && explicitCommand.command.name === 'fix';
  const isExplicitImplement = explicitCommand.kind === 'command' && explicitCommand.command.name === 'implement';
  if (!isExplicitFix && !isExplicitImplement && !isAgentConfigurationReady(param.agentConfiguration)) {
    logInfo("Agent not configured; skipping bugbot fix intent detection.");
    return results;
  }

  const branchOverride = resolveBranchOverride(param);

  const contextOptions: LoadBugbotContextOptions | undefined = branchOverride
    ? {
        branchOverride,
        ...(param.target.pullRequestNumber > 0 ? { pullRequestNumberOverride: param.target.pullRequestNumber } : {}),
      }
    : undefined;
  const context = await loadBugbotContext(
    projectBugbotContextRequest(param, contextOptions),
    ports.contextPorts,
  );
  const unresolvedWithBody = context.unresolvedFindingsWithBody ?? [];

  const unresolvedIds = new Set(unresolvedWithBody.map((finding) => finding.id));
  const unresolvedFindings = buildUnresolvedFindingSummaries(unresolvedWithBody);
  const parentCommentBody = await resolveParentCommentBody(param, ports.contextPorts);
  if (isExplicitImplement) {
    const requestText = explicitCommand.command.arguments.join(' ').trim();
    results.push(new Result({
      id: TASK_ID,
      success: true,
      executed: true,
      steps: ['Explicit implement command selected the authorized repository-change route.'],
      payload: {
        isFixRequest: false,
        isDoRequest: true,
        isReviewRequest: false,
        targetFindingIds: [],
        requestText,
        context,
        branchOverride,
      } as BugbotFixIntent & { context?: typeof context; branchOverride?: string },
    }));
    return results;
  }
  if (explicitCommand.kind === 'command' && explicitCommand.command.name === 'fix') {
    if (unresolvedIds.size === 0) {
      logInfo("No unresolved bugbot findings for explicit fix command; skipping autofix.");
      return results;
    }
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
    configuration: param.agentConfiguration,
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
        payload: {
          isFixRequest: false,
          isDoRequest: false,
          isReviewRequest: false,
          targetFindingIds: [] as string[],
        },
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

function resolveBranchOverride(param: BugbotFixIntentContext): string | undefined {
  const pullRequestBranch = param.comment.isPullRequestReviewComment
    ? param.target.headBranch.trim()
    : undefined;
  if (pullRequestBranch) return pullRequestBranch;
  return param.target.commitBranch.trim() || undefined;
}

async function resolveParentCommentBody(
  param: BugbotFixIntentContext,
  contextPorts: BugbotContextPorts,
): Promise<string | undefined> {
  if (!param.comment.isPullRequestReviewComment || !param.comment.parentCommentId) {
    return undefined;
  }
  const parentBody = await contextPorts.getPullRequestReviewCommentBody(
    param.target.pullRequestNumber,
    param.comment.parentCommentId,
  );
  return parentBody ?? undefined;
}
