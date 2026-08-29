import type { BugbotIssueComment, BugbotIssueReadPort } from '../../../application/ports/bugbot_issue_read_ports';
import type { BugbotIssueCommentWritePort } from '../../../application/ports/bugbot_issue_write_ports';

export class BugbotIssueRepository implements BugbotIssueReadPort, BugbotIssueCommentWritePort {
    constructor(private readonly content: BugbotIssueReadPort & BugbotIssueCommentWritePort) {}

    listIssueComments = (...args: Parameters<BugbotIssueReadPort['listIssueComments']>): Promise<BugbotIssueComment[]> => this.content.listIssueComments(...args);
    addComment = (...args: Parameters<BugbotIssueCommentWritePort['addComment']>) => this.content.addComment(...args);
    updateComment = (...args: Parameters<BugbotIssueCommentWritePort['updateComment']>) => this.content.updateComment(...args);
}
