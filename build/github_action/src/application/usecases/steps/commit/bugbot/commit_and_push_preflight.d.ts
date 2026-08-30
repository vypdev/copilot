import type { GitCommitPort } from "../../../../../application/ports/git_ports";
import type { Execution } from "../../../../../data/model/execution";
export interface CommitAndPushPreflightOptions {
    branch: string;
    branchOverride?: boolean;
    workspacePaths?: string[];
}
export type CommitAndPushPreflightResult = {
    status: "ready";
} | {
    status: "success";
} | {
    status: "failure";
    error: string;
};
export declare function runCommitAndPushPreflight(execution: Execution, options: CommitAndPushPreflightOptions, gitCommitPort: GitCommitPort): Promise<CommitAndPushPreflightResult>;
