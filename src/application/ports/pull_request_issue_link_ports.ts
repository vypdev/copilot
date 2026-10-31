import type { PullRequestLinkIdentity } from '../../domain/pull_request_issue_link_state';
export interface PullRequestIssueLinkPort {
    isLinked(owner: string, repository: string, pullRequestNumber: number, issueNumber: number, token: string): Promise<boolean>;
    getDetails(owner: string, repository: string, pullRequestNumber: number, token: string): Promise<PullRequestLinkDetails>;
    updateBaseBranch(owner: string, repository: string, pullRequestNumber: number, baseBranch: string, token: string): Promise<void>;
    updateDescription(owner: string, repository: string, pullRequestNumber: number, description: string, token: string): Promise<void>;
}


export interface PullRequestLinkDetails {
    readonly body: string;
    readonly identity?: PullRequestLinkIdentity;
    readonly baseBranch: string;
}

/** Repository-credential-bound PR linkage query and mutation authority. */
export interface BoundPullRequestIssueLinkPort {
    isLinked(pullRequestNumber: number, issueNumber: number): Promise<boolean>;
    getDetails(pullRequestNumber: number): Promise<PullRequestLinkDetails>;
    updateBaseBranch(pullRequestNumber: number, baseBranch: string): Promise<void>;
    updateDescription(pullRequestNumber: number, description: string): Promise<void>;
}
