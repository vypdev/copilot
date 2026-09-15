import { Result } from '../../../data/model/result';
import type { BoundIssueLabelsPort, BoundIssueProgressPort } from '../../ports/issue_management_ports';
import type { BoundPullRequestBranchQueryPort } from '../../ports/pull_request_branch_ports';
import type { ProgressContext } from '../push_single_action_contexts';
import { logDebugInfo, logError, logInfo, logWarn } from '../../ports/logging_ports';
import { getTaskEmoji } from '../../../utils/task_emoji';
import { syncProgressLabelsToOpenPullRequests } from './sync_progress_labels_to_open_pull_requests';
import { buildProgressSummaryMessage } from './progress_summary_builder';
import { analyzeProgress, type ProgressAnalysisDependencies } from './progress_analysis_workflow';
import { ApplicationError, toApplicationError } from '../../errors/application_error';
import type { BoundPublicationSourceQueryPort } from '../../ports/publication_freshness_ports';
import { buildStaleSourcePublicationPayload } from '../../policies/publication_outcome_policy';

export interface CheckProgressWorkflowDependencies extends ProgressAnalysisDependencies {
    issueLabelsPort: BoundIssueLabelsPort;
    issueProgressPort: BoundIssueProgressPort;
    pullRequestRepository: BoundPullRequestBranchQueryPort;
}

/** Publishes a completed progress assessment after the analysis workflow succeeds. */
export async function runCheckProgressWorkflow(
    param: ProgressContext,
    taskId: string,
    dependencies: CheckProgressWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(taskId)} Executing ${taskId}.`);

    try {
        const analysis = await analyzeProgress(param, taskId, dependencies);
        if (analysis.kind === 'failure') return [analysis.result];
        if (analysis.kind === 'stale-source') {
            logInfo(`Progress analysis omitted: ${analysis.branch} no longer points at the event source.`);
            return [buildStaleSourceResult(taskId, analysis.branch, analysis.sourceHeadSha)];
        }

        const { attemptResult, issueNumber, branch, developmentBranch, sourceHeadSha } = analysis;
        const { progress, summary, reasoning, remaining } = attemptResult;
        logProgressAssessment(progress, summary, reasoning, remaining);

        if (!await sourceIsCurrent(branch, sourceHeadSha, dependencies.publicationSourceQuery)) {
            logInfo(`Progress mutation omitted: ${branch} no longer points at the analyzed source.`);
            return [buildStaleSourceResult(taskId, branch, sourceHeadSha)];
        }

        if (progress === 0) {
            return [buildZeroProgressResult(
                taskId,
                issueNumber,
                branch,
                developmentBranch,
                summary,
                reasoning,
                sourceHeadSha,
            )];
        }

        await persistProgress(param, issueNumber, branch, progress, dependencies);
        return [buildProgressResult(
            taskId,
            issueNumber,
            branch,
            developmentBranch,
            progress,
            summary,
            reasoning,
            remaining,
            sourceHeadSha,
        )];
    } catch (error) {
        const semanticError = toApplicationError(error, 'workflow.failed', `Unable to complete ${taskId}.`);
        logError(semanticError);
        return [
            new Result({
                id: taskId,
                success: false,
                executed: true,
                errors: [semanticError],
            }),
        ];
    }
}

async function sourceIsCurrent(
    branch: string,
    sourceHeadSha: string,
    sourceQuery: BoundPublicationSourceQueryPort,
): Promise<boolean> {
    return await sourceQuery.getBranchHeadSha(branch) === sourceHeadSha;
}

function buildStaleSourceResult(taskId: string, branch: string, sourceHeadSha: string): Result {
    return new Result({
        id: taskId,
        success: true,
        executed: false,
        payload: buildStaleSourcePublicationPayload(branch, sourceHeadSha),
    });
}

function buildZeroProgressResult(
    taskId: string,
    issueNumber: number,
    branch: string,
    developmentBranch: string,
    summary: string,
    reasoning: string,
    sourceHeadSha: string,
): Result {
    const message = 'Progress detection returned 0%. This may be due to a model error or no changes detected. Consider re-running the check.';
    logError(message);
    return new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: [`Progress for issue #${issueNumber}: 0%`, summary],
        errors: [new ApplicationError('agent.failed', message)],
        payload: {
            progress: 0,
            summary,
            reasoning: reasoning || undefined,
            issueNumber,
            branch,
            developmentBranch,
            sourceHeadSha,
        },
    });
}

async function persistProgress(
    param: ProgressContext,
    issueNumber: number,
    branch: string,
    progress: number,
    dependencies: CheckProgressWorkflowDependencies,
): Promise<void> {
    await dependencies.issueProgressPort.setProgressLabel(issueNumber, progress);
    await syncProgressLabelsToOpenPullRequests(
        branch,
        progress,
        dependencies.issueLabelsPort,
        dependencies.pullRequestRepository,
    );
}

function buildProgressResult(
    taskId: string,
    issueNumber: number,
    branch: string,
    developmentBranch: string,
    progress: number,
    summary: string,
    reasoning: string,
    remaining: string,
    sourceHeadSha: string,
): Result {
    return new Result({
        id: taskId,
        success: true,
        executed: true,
        steps: [`Progress updated to: ${progress}%`, buildProgressSummaryMessage({ summary, progress, remaining, reasoning })],
        payload: {
            progress,
            summary,
            reasoning: reasoning || undefined,
            remaining: progress < 100 && remaining ? remaining : undefined,
            issueNumber,
            branch,
            developmentBranch,
            sourceHeadSha,
        },
    });
}

function logProgressAssessment(
    progress: number,
    summary: string,
    reasoning: string,
    remaining: string,
): void {
    logDebugInfo(
        `CheckProgress: raw progress=${progress}, summary length=${summary.length}, reasoning length=${reasoning.length}, remaining length=${remaining.length}. Full summary:\n${summary}`,
    );
    if (reasoning) logDebugInfo(`CheckProgress: full reasoning:\n${reasoning}`);
    if (remaining) logDebugInfo(`CheckProgress: full remaining:\n${remaining}`);
    if (progress < 0 || progress > 100) {
        logWarn(`CheckProgress: unexpected progress value ${progress} (expected 0-100). Clamping for display.`);
    }
    if (progress > 0) logInfo(`✅ Progress detection completed: ${progress}%`);
}
