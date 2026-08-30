import { isAgentConfigurationReady } from '../../../../data/model/agent';
import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import { logDebugInfo, logError, logInfo } from '../../../ports/logging_ports';
import type { BugbotContextPorts } from '../../../ports/bugbot_context_ports';
import type { BugbotFindingPublicationPorts } from '../../../ports/bugbot_finding_publication_ports';
import type { BugbotFindingResolutionPorts } from '../../../ports/bugbot_finding_resolution_ports';
import { PullRequestReviewOperationError } from '../../../ports/pull_request_review_errors';
import { buildBugbotPrompt } from './bugbot/build_bugbot_prompt';
import { loadBugbotContext, type LoadBugbotContextOptions } from './bugbot/load_bugbot_context_use_case';
import { applyDetectedFindings, prepareDetectedFindings } from './bugbot/apply_detected_findings';
import type { PreparedBugbotFindings } from './bugbot/prepare_bugbot_findings';
import { queryBugbotFindings } from './bugbot/query_bugbot_findings';
import { reconcileResolvedFindingIds } from '../../../policies/bugbot_reconciliation_policy';
import { projectBugbotFindingStatuses } from '../../../policies/bugbot_finding_status_policy';
import type { BugbotContext } from './bugbot/types';

export interface DetectPotentialProblemsWorkflowDependencies {
    aiRepository: FindingsQueryPort;
    contextPorts: BugbotContextPorts;
    publicationPorts: BugbotFindingPublicationPorts;
    resolutionPorts: BugbotFindingResolutionPorts;
}

const TASK_ID = 'DetectPotentialProblemsUseCase';

/** Coordinates Bugbot context, analysis and finding publication behind application ports. */
export async function runDetectPotentialProblemsWorkflow(
    param: Execution,
    dependencies: DetectPotentialProblemsWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(TASK_ID)} Executing ${TASK_ID}.`);
    try {
        if (shouldSkipDetection(param)) return [];

        const contextOptions = await resolveContextOptions(param, dependencies.contextPorts);
        if (contextOptions === null) {
            logDebugInfo('No branch or pull request target available for potential-problems detection.');
            return [];
        }
        const context = await loadBugbotContext(param, contextOptions, dependencies.contextPorts);
        const prompt = buildBugbotPrompt(param, context);
        logInfo('Detecting potential problems via configured agent (agent computes changes and checks resolved)...');
        const preparedResponse = prepareDetectedFindings(
            param,
            await queryBugbotFindings(dependencies.aiRepository, param, prompt),
        );
        if (preparedResponse === undefined) {
            return [noAnalysisResult()];
        }
        const prepared: PreparedBugbotFindings = {
            ...preparedResponse,
            resolvedFindingIds: reconcileResolvedFindingIds(
                preparedResponse.resolvedFindingIds,
                context.existingByFindingId,
                preparedResponse.activeFindings ?? preparedResponse.toPublish,
            ),
        };
        if (prepared.toPublish.length === 0 && prepared.resolvedFindingIds.size === 0) {
            return [noFindingsResult(projectBugbotFindingStatuses(
                context.existingByFindingId,
                prepared.activeFindings ?? prepared.toPublish,
            ).counts)];
        }

        const resolutionErrors = await applyDetectedFindings(
            param,
            context,
            prepared,
            dependencies.publicationPorts,
            dependencies.resolutionPorts,
        );
        return [detectionResult(prepared, context, resolutionErrors)];
    } catch (error) {
        const normalizedError = error instanceof PullRequestReviewOperationError
            ? error
            : new Error('Unable to detect potential problems.');
        const resultError = new Error(`Error in ${TASK_ID}: ${normalizedError.message}`);
        logError(resultError.message);
        return [new Result({
            id: TASK_ID,
            success: false,
            executed: true,
            errors: [resultError],
        })];
    }
}

async function resolveContextOptions(
    param: Execution,
    contextPorts: BugbotContextPorts,
): Promise<LoadBugbotContextOptions | undefined | null> {
    if (param.isPullRequest) {
        return {
            branchOverride: param.pullRequest.head,
            issueNumberOverride: param.issueNumber,
            pullRequestNumberOverride: param.pullRequest.number,
        };
    }
    if (param.commit.branch?.trim()) return undefined;
    if (!['issues', 'issue_comment'].includes(param.eventName) || param.issueNumber <= 0) return undefined;
    const branch = await contextPorts.pullRequest.getHeadBranchForIssue(
        param.owner,
        param.repo,
        param.issueNumber,
        param.tokens.token,
    );
    return branch ? { branchOverride: branch } : null;
}

function shouldSkipDetection(param: Execution): boolean {
    if (!isAgentConfigurationReady(param.ai?.getAgentConfiguration(param.isPullRequest ? 'reviewer' : 'findings'))) {
        logDebugInfo('Agent not configured; skipping potential problems detection.');
        return true;
    }
    if (param.issueNumber === -1 && (!param.isPullRequest || param.pullRequest.number <= 0)) {
        logDebugInfo('No issue or pull request number for this execution; skipping potential problems detection.');
        return true;
    }
    return false;
}

function noAnalysisResult(): Result {
    logDebugInfo('DetectPotentialProblems: No response from configured agent.');
    return new Result({
        id: TASK_ID,
        success: false,
        executed: true,
        errors: [new Error('The configured agent returned no potential-problem analysis.')],
    });
}

function noFindingsResult(findingStates: Readonly<Record<string, number>>): Result {
    return new Result({
        id: TASK_ID,
        success: true,
        executed: true,
        steps: [`Potential problems detection completed (no new findings, no resolved). States: ${formatStateCounts(findingStates)}.`],
        payload: { findingStates },
    });
}

function detectionResult(
    prepared: PreparedBugbotFindings,
    context: BugbotContext,
    resolutionErrors: Error[],
): Result {
    const stepParts = [`${prepared.toPublish.length} new/current finding(s) from configured agent`];
    if (prepared.overflowCount > 0) stepParts.push(`${prepared.overflowCount} more not published (see summary comment)`);
    if (prepared.resolvedFindingIds.size > 0) stepParts.push(`${prepared.resolvedFindingIds.size} marked as resolved by configured agent`);
    const statusSummary = projectBugbotFindingStatuses(
        context.existingByFindingId,
        prepared.activeFindings ?? prepared.toPublish,
        prepared.resolvedFindingIds,
        prepared.resolvedFindingResolutions,
    );
    stepParts.push(`states: ${formatStateCounts(statusSummary.counts)}`);
    return new Result({
        id: TASK_ID,
        success: resolutionErrors.length === 0,
        executed: true,
        steps: [`Potential problems detection completed. ${stepParts.join('; ')}.`],
        errors: resolutionErrors,
        payload: { findingStates: statusSummary.counts },
    });
}

function formatStateCounts(counts: Readonly<Record<string, number>>): string {
    return Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([state, count]) => `${state}=${count}`)
        .join(', ') || 'none';
}
