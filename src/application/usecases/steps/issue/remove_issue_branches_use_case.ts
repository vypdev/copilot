import { Result } from "../../../../data/model/result";
import type { BoundBranchLifecyclePort } from "../../../ports/branch_lifecycle_ports";
import { logDebugInfo, logError, logInfo, logWarn } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { selectIssueBranchesToRemove } from './remove_issue_branches_policy';
import { toApplicationError } from '../../../errors/application_error';
import type { RemoveIssueBranchesContext } from '../../issue_workflow_context';

/**
 * Remove any branch created for this issue
 */
export class RemoveIssueBranchesUseCase implements ParamUseCase<RemoveIssueBranchesContext, Result[]> {
    taskId: string = 'RemoveIssueBranchesUseCase';
    constructor(private readonly branchLifecyclePort: BoundBranchLifecyclePort) {}

    async invoke(param: RemoveIssueBranchesContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const results: Result[] = []
        try {
            const branches = await this.branchLifecyclePort.getListOfBranches();

            const branchNames = selectIssueBranchesToRemove(
                branches,
                param.issueNumber,
                param.managedBranchTypes,
            );
            for (const branchName of branchNames) {
                results.push(...await removeIssueBranch(param, this.taskId, branchName, this.branchLifecyclePort));
            }
        } catch (error) {
            const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to remove issue branches.');
            logError(semanticError);
            results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to remove issue branches, but there was a problem.`,
                    ],
                    errors: [semanticError],
                })
            )
        }
        return results;
    }
}

async function removeIssueBranch(
    param: RemoveIssueBranchesContext,
    taskId: string,
    branchName: string,
    branchLifecyclePort: BoundBranchLifecyclePort,
): Promise<Result[]> {
    logDebugInfo(`RemoveIssueBranches: attempting to remove branch ${branchName}.`);
    const removed = await branchLifecyclePort.removeBranch(branchName);
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
    if (param.previousBranchType === param.hotfixBranchType) {
        results.push(new Result({
            id: taskId,
            success: true,
            executed: true,
            reminders: [`Determine if the \`${param.hotfixBranchType}\` branch is no longer required and can be removed.`],
        }));
    }
    return results;
}
