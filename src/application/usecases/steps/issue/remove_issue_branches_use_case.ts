import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { BranchLifecyclePort } from "../../../ports/branch_lifecycle_ports";
import { logDebugInfo, logError, logInfo, logWarn } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { selectIssueBranchesToRemove } from './remove_issue_branches_policy';

/**
 * Remove any branch created for this issue
 */
export class RemoveIssueBranchesUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'RemoveIssueBranchesUseCase';
    constructor(private readonly branchLifecyclePort: BranchLifecyclePort) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const results: Result[] = []
        try {
            const branches = await this.branchLifecyclePort.getListOfBranches(
                param.owner,
                param.repo,
                param.tokens.token,
            );

            const branchNames = selectIssueBranchesToRemove(
                branches,
                param.issueNumber,
                [param.branches.featureTree, param.branches.bugfixTree],
            );
            for (const branchName of branchNames) {
                results.push(...await removeIssueBranch(param, this.taskId, branchName, this.branchLifecyclePort));
            }
        } catch (error) {
            logError(`RemoveIssueBranches: error removing branches for issue #${param.issueNumber}.`, error instanceof Error ? { stack: (error as Error).stack } : undefined);
            results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to remove issue branches, but there was a problem.`,
                    ],
                    errors: [error],
                })
            )
        }
        return results;
    }
}

async function removeIssueBranch(
    param: Execution,
    taskId: string,
    branchName: string,
    branchLifecyclePort: BranchLifecyclePort,
): Promise<Result[]> {
    logDebugInfo(`RemoveIssueBranches: attempting to remove branch ${branchName}.`);
    const removed = await branchLifecyclePort.removeBranch(
        param.owner,
        param.repo,
        branchName,
        param.tokens.token,
    );
    if (!removed) {
        logWarn(`RemoveIssueBranches: failed to remove branch ${branchName}.`);
        return [];
    }
    logDebugInfo(`RemoveIssueBranches: removed branch ${branchName}.`);
    const results = [new Result({
        id: taskId,
        success: true,
        executed: true,
        steps: [`The branch \`${branchName}\` was removed.`],
    })];
    if (param.previousConfiguration?.branchType === param.branches.hotfixTree) {
        results.push(new Result({
            id: taskId,
            success: true,
            executed: true,
            reminders: [`Determine if the \`${param.branches.hotfixTree}\` branch is no longer required and can be removed.`],
        }));
    }
    return results;
}
