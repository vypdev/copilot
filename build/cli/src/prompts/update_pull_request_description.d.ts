export type UpdatePullRequestDescriptionParams = {
    projectContextInstruction: string;
    baseBranch: string;
    headBranch: string;
    issueNumber: string;
    issueDescription: string;
    relatedIssueInstruction: string;
};
export declare function getUpdatePullRequestDescriptionPrompt(params: UpdatePullRequestDescriptionParams): string;
