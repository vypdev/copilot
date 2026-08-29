import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { BranchLifecyclePort } from "../../../ports/branch_lifecycle_ports";
import { logDebugInfo, logError, logInfo, logWarn } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

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
            const branchTypes = [param.branches.featureTree, param.branches.bugfixTree];

            const branches = await this.branchLifecyclePort.getListOfBranches(
                param.owner,
                param.repo,
                param.tokens.token,
            );

            for (const type of branchTypes) {
                logDebugInfo(`Checking branch type ${type}`)

                let branchName = '';
                const prefix = `${type}/${param.issueNumber}-`;
                logDebugInfo(`Checking prefix ${prefix}`)

                const matchingBranch = branches.find(branch => branch.indexOf(prefix) > -1);
                if (!matchingBranch) continue;
                branchName = matchingBranch;
                logDebugInfo(`RemoveIssueBranches: attempting to remove branch ${branchName}.`);
                const removed = await this.branchLifecyclePort.removeBranch(
                    param.owner,
                    param.repo,
                    branchName,
                    param.tokens.token,
                );
                if (removed) {
                    logDebugInfo(`RemoveIssueBranches: removed branch ${branchName}.`);
                    results.push(
                        new Result({
                            id: this.taskId,
                            success: true,
                            executed: true,
                            steps: [
                                `The branch \`${branchName}\` was removed.`,
                            ],
                        })
                    )
                    if (param.previousConfiguration?.branchType === param.branches.hotfixTree) {
                        results.push(
                            new Result({
                                id: this.taskId,
                                success: true,
                                executed: true,
                                reminders: [
                                    `Determine if the \`${param.branches.hotfixTree}\` branch is no longer required and can be removed.`,
                                ],
                            })
                        )
                    }
                } else {
                    logWarn(`RemoveIssueBranches: failed to remove branch ${branchName}.`);
                }
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
