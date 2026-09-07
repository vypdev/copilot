export interface BugbotIssueComment {
    id: number;
    body: string | null;
    user?: {
        login?: string;
    };
}
export interface BugbotIssueReadPort {
    listIssueComments(owner: string, repository: string, issueNumber: number, token: string): Promise<BugbotIssueComment[]>;
}
