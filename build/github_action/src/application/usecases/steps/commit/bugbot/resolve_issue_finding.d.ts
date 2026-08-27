import type { BugbotIssueCommentUpdatePort } from "../../../../../application/ports/bugbot_issue_write_ports";
export interface IssueFindingResolution {
    findingId: string;
    comment: {
        id: number;
        body: string;
    };
    owner: string;
    repo: string;
    issueNumber: number;
    token: string;
}
export declare function resolveIssueFinding(repository: BugbotIssueCommentUpdatePort, resolution: IssueFindingResolution): Promise<void>;
