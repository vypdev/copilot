export interface BugbotIssueComment {
    id: number;
    body: string | null;
    user?: {
        login?: string;
    };
    createdAt?: string;
}
export interface BugbotIssueReadPort {
    listIssueComments(owner: string, repository: string, issueNumber: number, token: string): Promise<BugbotIssueComment[]>;
}
