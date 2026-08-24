import { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";
import type { BranchMergePort } from "../../../application/ports/branch_merge_ports";
import type { IssueClosurePort } from "../../../application/ports/issue_lifecycle_ports";
import type { IssueLabelsPort } from "../../../application/ports/issue_management_ports";
import { ParamUseCase } from "../base/param_usecase";
/**
 * Single action run after a successful deployment (triggered with the "deployed" action and an issue number).
 *
 * Requires the issue to have the "deploy" label and not already have the "deployed" label. Then:
 * 1. Replaces the "deploy" label with "deployed".
 * 2. If a release or hotfix branch is configured: merges it into default and develop (each via PR, waiting for that PR's checks).
 * 3. Closes the issue only when all merges succeed.
 *
 * @see docs/single-actions/deploy-label-and-merge.mdx for the full flow and how merge/check waiting works.
 */
export declare class DeployedActionUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueLabelsPort;
    private readonly issueClosurePort;
    private readonly branchMergePort;
    taskId: string;
    constructor(issueLabelsPort: IssueLabelsPort, issueClosurePort: IssueClosurePort, branchMergePort: BranchMergePort);
    invoke(param: Execution): Promise<Result[]>;
}
