import type { BugbotIssueCommentWritePort } from "../../../../../application/ports/bugbot_issue_write_ports";
import type { Execution } from "../../../../../data/model/execution";
import type { BugbotFinding, ExistingFindingInfo } from "./types";
export declare function publishIssueFindingComment(repository: BugbotIssueCommentWritePort, execution: Execution, finding: BugbotFinding, existing: ExistingFindingInfo | undefined, commitSha: string | undefined): Promise<void>;
