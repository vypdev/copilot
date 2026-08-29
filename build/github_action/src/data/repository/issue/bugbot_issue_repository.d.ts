import type { BugbotIssueComment, BugbotIssueReadPort } from '../../../application/ports/bugbot_issue_read_ports';
import type { BugbotIssueCommentWritePort } from '../../../application/ports/bugbot_issue_write_ports';
export declare class BugbotIssueRepository implements BugbotIssueReadPort, BugbotIssueCommentWritePort {
    private readonly content;
    constructor(content: BugbotIssueReadPort & BugbotIssueCommentWritePort);
    listIssueComments: (...args: Parameters<BugbotIssueReadPort["listIssueComments"]>) => Promise<BugbotIssueComment[]>;
    addComment: (...args: Parameters<BugbotIssueCommentWritePort["addComment"]>) => Promise<void>;
    updateComment: (...args: Parameters<BugbotIssueCommentWritePort["updateComment"]>) => Promise<void>;
}
