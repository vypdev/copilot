import type { BugbotIssueCommentUpdatePort } from "../../../../../application/ports/bugbot_issue_write_ports";
import type { BugbotFindingResolution } from './types';
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
    resolution?: BugbotFindingResolution;
}
export declare function resolveIssueFinding(repository: BugbotIssueCommentUpdatePort, resolution: IssueFindingResolution): Promise<void>;
