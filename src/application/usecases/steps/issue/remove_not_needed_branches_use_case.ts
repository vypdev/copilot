import { Result } from "../../../../data/model/result";
import type { BoundBranchLifecyclePort, BranchNamePort } from "../../../ports/branch_lifecycle_ports";
import { logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { toApplicationError } from "../../../errors/application_error";
import type { RemoveObsoleteIssueBranchesContext } from '../../issue_workflow_context';

export class RemoveNotNeededBranchesUseCase implements ParamUseCase<RemoveObsoleteIssueBranchesContext, Result[]> {
    taskId = "RemoveNotNeededBranchesUseCase";
    constructor(
        private readonly branchLifecyclePort: BoundBranchLifecyclePort,
        private readonly branchNamePort: BranchNamePort,
    ) {}

    async invoke(param: RemoveObsoleteIssueBranchesContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        try {
            const issueTitle = param.issueTitle;
            if (!issueTitle) return this.missingTitleResult();

            const branches = await this.branchLifecyclePort.getListOfBranches();
            const sanitizedTitle = this.branchNamePort.formatBranchName(issueTitle, param.issueNumber);
            const finalBranch = `${param.managementBranch}/${param.issueNumber}-${sanitizedTitle}`;
            const candidates = this.findCandidates(param, branches, finalBranch);

            const results: Result[] = [];
            for (const branch of candidates) {
                results.push(...await this.removeBranch(param, branch));
            }
            return results;
        } catch (error) {
            return [
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: ["Tried to remove not needed branches related to the issue, but there was a problem."],
                    errors: [toApplicationError(error, 'provider.unavailable', 'Unable to remove obsolete issue branches.')],
                }),
            ];
        }
    }

    private findCandidates(param: RemoveObsoleteIssueBranchesContext, branches: readonly string[], finalBranch: string): string[] {
        return param.managedBranchTypes.flatMap((type) => {
            const prefix = `${type}/${param.issueNumber}-`;
            return branches.filter((branch) => {
                if (!branch.includes(prefix)) return false;
                return type !== param.managementBranch || branch !== finalBranch;
            });
        });
    }

    private async removeBranch(_param: RemoveObsoleteIssueBranchesContext, branch: string): Promise<Result[]> {
        const removed = await this.branchLifecyclePort.removeBranch(branch);
        const inlineCode = "`";
        if (removed) {
            return [
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: true,
                    steps: [`The branch ${inlineCode}${branch}${inlineCode} was removed.`],
                }),
            ];
        }

        logError(`Error deleting ${branch}`);
        return [
            new Result({
                id: this.taskId,
                success: false,
                executed: true,
                steps: [`Tried to remove not needed branch ${inlineCode}${branch}${inlineCode}, but there was a problem.`],
            }),
        ];
    }

    private missingTitleResult(): Result[] {
        return [
            new Result({
                id: this.taskId,
                success: true,
                executed: true,
                steps: ["Tried to remove not needed branches related to the issue, but the issue title was not found."],
            }),
        ];
    }
}
