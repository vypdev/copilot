import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { IssueLabelsPort, IssueProgressPort } from '../../ports/issue_management_ports';
import type { PullRequestBranchQueryPort } from '../../ports/pull_request_branch_ports';
import { logDebugInfo, logError, logInfo, logWarn } from '../../ports/logging_ports';
import { getTaskEmoji } from '../../../utils/task_emoji';
import { syncProgressLabelsToOpenPullRequests } from './sync_progress_labels_to_open_pull_requests';
import { buildProgressSummaryMessage } from './progress_summary_builder';
import { analyzeProgress, type ProgressAnalysisDependencies } from './progress_analysis_workflow';

export interface CheckProgressWorkflowDependencies extends ProgressAnalysisDependencies {
    issueRepository: IssueLabelsPort & IssueProgressPort;
    pullRequestRepository: PullRequestBranchQueryPort;
}

/** Publishes a completed progress assessment after the analysis workflow succeeds. */
export async function runCheckProgressWorkflow(
    param: Execution,
    taskId: string,
    dependencies: CheckProgressWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(taskId)} Executing ${taskId}.`);

    try {
        const analysis = await analyzeProgress(param, taskId, dependencies);
        if (analysis.kind === 'failure') return [analysis.result];

        const { attemptResult, issueNumber, branch, developmentBranch } = analysis;
        const { progress, summary, reasoning, remaining } = attemptResult;
        logProgressAssessment(progress, summary, reasoning, remaining);

        if (progress === 0) {
            return [buildZeroProgressResult(taskId, issueNumber, branch, developmentBranch, summary, reasoning)];
        }

        await persistProgress(param, issueNumber, branch, progress, dependencies);
        return [buildProgressResult(taskId, issueNumber, branch, developmentBranch, progress, summary, reasoning, remaining)];
    } catch (error) {
        logError(`Error in ${taskId}: ${JSON.stringify(error, null, 2)}`);
        return [
            new Result({
                id: taskId,
                success: false,
                executed: true,
                errors: [
                    new Error(
                        `Error in ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
                    ),
                ],
            }),
        ];
    }
}

function buildZeroProgressResult(
    taskId: string,
    issueNumber: number,
    branch: string,
    developmentBranch: string,
    summary: string,
    reasoning: string,
): Result {
    const message = 'Progress detection returned 0%. This may be due to a model error or no changes detected. Consider re-running the check.';
    logError(message);
    return new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: [`Progress for issue #${issueNumber}: 0%`, summary],
        errors: [message],
        payload: { progress: 0, summary, reasoning: reasoning || undefined, issueNumber, branch, developmentBranch },
    });
}

async function persistProgress(
    param: Execution,
    issueNumber: number,
    branch: string,
    progress: number,
    dependencies: CheckProgressWorkflowDependencies,
): Promise<void> {
    await dependencies.issueRepository.setProgressLabel(param.owner, param.repo, issueNumber, progress, param.tokens.token);
    await syncProgressLabelsToOpenPullRequests(
        param.owner,
        param.repo,
        branch,
        progress,
        param.tokens.token,
        dependencies.issueRepository,
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
