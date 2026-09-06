export declare const sanitizeIssueTitle: (title: string) => string;
export declare const sanitizePullRequestTitle: (title: string) => string;
/** Removes Copilot's generated PR prefix before formatting the title again. */
export declare function normalizePullRequestSourceTitle(title: string, issueNumber: number): string;
