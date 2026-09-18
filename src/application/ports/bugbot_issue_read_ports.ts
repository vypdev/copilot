export interface BugbotIssueComment {
    id: number;
    body: string | null;
    user?: { login?: string };
    /** Provider-authenticated author classification; never inferred from the login. */
    isAutomatedAuthor?: boolean;
    createdAt?: string;
}

export interface BugbotIssueReadPort {
    listIssueComments(owner: string, repository: string, issueNumber: number, token: string): Promise<BugbotIssueComment[]>;
}
