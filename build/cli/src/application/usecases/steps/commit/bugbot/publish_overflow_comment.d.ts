import type { BugbotIssueCommentWritePort } from "../../../../../application/ports/bugbot_issue_write_ports";
import type { Execution } from "../../../../../data/model/execution";
export declare function publishOverflowComment(repository: BugbotIssueCommentWritePort, execution: Execution, overflowCount: number, overflowTitles: string[], commitSha: string | undefined): Promise<void>;
