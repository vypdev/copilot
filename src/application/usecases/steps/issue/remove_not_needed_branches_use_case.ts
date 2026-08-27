import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { BranchLifecyclePort, BranchNamePort } from "../../../ports/branch_lifecycle_ports";
import { logError, logInfo } from "../../../../utils/logger";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

export class RemoveNotNeededBranchesUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = "RemoveNotNeededBranchesUseCase";
    constructor(
        private readonly branchLifecyclePort: BranchLifecyclePort,
        private readonly branchNamePort: BranchNamePort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        try {
            const issueTitle = param.issue.title ?? "";
            if (!issueTitle) return this.missingTitleResult();

            const branches = await this.branchLifecyclePort.getListOfBranches(
                param.owner,
                param.repo,
                param.tokens.token,
            );
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
                    error,
                }),
            ];
        }
    }

    private findCandidates(param: Execution, branches: string[], finalBranch: string): string[] {
        const branchTypes = [param.branches.featureTree, param.branches.bugfixTree];
        return branchTypes.flatMap((type) => {
            const prefix = `${type}/${param.issueNumber}-`;
            return branches.filter((branch) => {
                if (!branch.includes(prefix)) return false;
                return type !== param.managementBranch || branch !== finalBranch;
            });
        });
    }

    private async removeBranch(param: Execution, branch: string): Promise<Result[]> {
        const removed = await this.branchLifecyclePort.removeBranch(
            param.owner,
            param.repo,
            branch,
            param.tokens.token,
        );
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
