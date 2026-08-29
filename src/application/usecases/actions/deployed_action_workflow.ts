import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { BranchMergePort } from '../../../application/ports/branch_merge_ports';
import type { IssueClosurePort } from '../../../application/ports/issue_lifecycle_ports';
import type { IssueLabelsPort } from '../../../application/ports/issue_management_ports';
import { buildDeploymentMergePlan } from '../../../application/policies/deployed_action_policy';
import { logDebugInfo, logError, logInfo } from '../../ports/logging_ports';
import { getTaskEmoji } from '../../../utils/task_emoji';

export interface DeployedActionWorkflowDependencies {
    issueLabelsPort: IssueLabelsPort;
    issueClosurePort: IssueClosurePort;
    branchMergePort: BranchMergePort;
}

const TASK_ID = 'DeployedActionUseCase';

/** Replaces the deploy label, performs ordered merges, and closes only after all succeed. */
export async function runDeployedActionWorkflow(
    param: Execution,
    dependencies: DeployedActionWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(TASK_ID)} Executing ${TASK_ID}.`);
    const results: Result[] = [];

    try {
        const preconditionFailure = validateDeploymentLabels(param);
        if (preconditionFailure) return [preconditionFailure];

        const labelNames = param.labels.currentIssueLabels
            .filter((name) => name !== param.labels.deploy)
            .concat(param.labels.deployed);
        await dependencies.issueLabelsPort.setLabels(
            param.owner,
            param.repo,
            param.singleAction.issue,
            labelNames,
            param.tokens.token,
        );
        logDebugInfo(`Updated labels on issue #${param.singleAction.issue}:`);
        logDebugInfo(`Labels: ${labelNames}`);
        results.push(new Result({
            id: TASK_ID,
            success: true,
            executed: true,
            steps: [`Label \`${param.labels.deployed}\` added after a success deploy.`],
        }));

        const mergeResults = await mergeBranches(param, dependencies.branchMergePort);
        const flattenedMergeResults = mergeResults.flat();
        results.push(...flattenedMergeResults);
        const mergesAttempted = flattenedMergeResults.length > 0;
        const allMergesSucceeded = mergesAttempted && flattenedMergeResults.every((result) => result.success);
        if (allMergesSucceeded) {
            await closeIssueAfterSuccessfulMerges(param, dependencies.issueClosurePort, results);
        } else {
            results.push(mergeFailureResult(param, mergesAttempted));
        }
        return results;
    } catch (error) {
        logError(error);
        results.push(new Result({
            id: TASK_ID,
            success: false,
            executed: true,
            steps: ['Tried to assign members to issue.'],
            errors: [error],
        }));
        return results;
    }
}

function validateDeploymentLabels(param: Execution): Result | undefined {
    if (!param.labels.isDeploy) {
        return new Result({
            id: TASK_ID,
            success: false,
            executed: true,
            steps: [`Tried to set label \`${param.labels.deployed}\` but there was no \`${param.labels.deploy}\` label.`],
        });
    }
    if (param.labels.isDeployed) {
        return new Result({
            id: TASK_ID,
            success: false,
            executed: true,
            steps: [`Tried to set label \`${param.labels.deployed}\` but it was already set.`],
        });
    }
    return undefined;
}

async function mergeBranches(
    param: Execution,
    branchMergePort: BranchMergePort,
): Promise<Result[][]> {
    const plan = buildDeploymentMergePlan({
        releaseBranch: param.currentConfiguration.releaseBranch,
        hotfixBranch: param.currentConfiguration.hotfixBranch,
        defaultBranch: param.branches.defaultBranch,
        developmentBranch: param.branches.development,
    });
    const mergeResults: Result[][] = [];
    for (const merge of plan) {
        mergeResults.push(await branchMergePort.mergeBranch(
            param.owner,
            param.repo,
            merge.source,
            merge.target,
            param.pullRequest.mergeTimeout,
            param.tokens.token,
        ));
    }
    return mergeResults;
}

async function closeIssueAfterSuccessfulMerges(
    param: Execution,
    issueClosurePort: IssueClosurePort,
    results: Result[],
): Promise<void> {
    const issueNumber = Number(param.singleAction.issue);
    const closed = await issueClosurePort.closeIssue(
        param.owner,
        param.repo,
        issueNumber,
        param.tokens.token,
    );
    if (!closed) return;
    logDebugInfo(`Issue #${issueNumber} closed after merges to default and develop.`);
    results.push(new Result({
        id: TASK_ID,
        success: true,
        executed: true,
        steps: [`Issue #${issueNumber} closed after merge to \`${param.branches.defaultBranch}\` and \`${param.branches.development}\`.`],
    }));
}

function mergeFailureResult(param: Execution, mergesAttempted: boolean): Result {
    const step = mergesAttempted
        ? `Issue #${param.singleAction.issue} was not closed because one or more merge operations failed.`
        : `Issue #${param.singleAction.issue} was not closed because no release or hotfix branch was configured (no merge operations were performed).`;
    return new Result({ id: TASK_ID, success: false, executed: true, steps: [step] });
}
