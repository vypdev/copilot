import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueLabelsPort } from "../../../ports/issue_management_ports";
import { ParamUseCase } from "../../base/param_usecase";
/**
 * Copies size and progress labels from the linked issue to the PR.
 * Used when a PR is opened so it gets the same size/progress as the issue (corner case:
 * no push has run yet, so CommitUseCase has not updated the PR).
 */
export declare class SyncSizeAndProgressLabelsFromIssueToPrUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueLabelsPort;
    taskId: string;
    constructor(issueLabelsPort: IssueLabelsPort);
    invoke(param: Execution): Promise<Result[]>;
}
