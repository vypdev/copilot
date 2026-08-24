import type { BugbotIssueComment, BugbotIssueReadPort } from '../../../application/ports/bugbot_issue_read_ports';
import type { BugbotIssueCommentWritePort } from '../../../application/ports/bugbot_issue_write_ports';
import type { IssueContentRepository } from './issue_content_repository';
export declare class BugbotIssueRepository implements BugbotIssueReadPort, BugbotIssueCommentWritePort {
    private readonly content;
    constructor(content: IssueContentRepository);
    listIssueComments: (...args: Parameters<BugbotIssueReadPort["listIssueComments"]>) => Promise<BugbotIssueComment[]>;
    addComment: (...args: Parameters<BugbotIssueCommentWritePort["addComment"]>) => Promise<void>;
    updateComment: (...args: Parameters<BugbotIssueCommentWritePort["updateComment"]>) => Promise<void>;
}
