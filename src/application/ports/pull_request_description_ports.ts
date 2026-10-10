import type { PullRequestReviewDiffSnapshot } from './bugbot_pull_request_read_ports';
import type { BugbotSourceCoverage } from '../../domain/bugbot/context';

export interface PullRequestDescriptionDetails {
    readonly body: string;
    readonly headBranch: string;
    readonly baseBranch: string;
}

export interface PullRequestDescriptionCommandPort {
    updateDescription(owner: string, repository: string, pullRequestNumber: number, description: string, token: string): Promise<void>;
    /** Optional read capability used by explicit commands from issue comments. */
    getDetails?(owner: string, repository: string, pullRequestNumber: number, token: string): Promise<PullRequestDescriptionDetails>;
}

/** Repository-credential-bound PR description read/write authority. */
export interface BoundPullRequestDescriptionPort {
    updateDescription(pullRequestNumber: number, description: string): Promise<void>;
    getDetails(pullRequestNumber: number): Promise<PullRequestDescriptionDetails>;
    getDiff(pullRequestNumber: number): ReturnType<PullRequestDescriptionDiffPort['getBoundedBugbotReviewDiffSnapshot']>;
}

/** Bounded read-only GitHub diff authority, separate from description writes. */
export interface PullRequestDescriptionDiffPort {
    getBoundedBugbotReviewDiffSnapshot(owner: string, repository: string, pullRequestNumber: number, token: string): Promise<{ readonly snapshot: PullRequestReviewDiffSnapshot; readonly coverage: BugbotSourceCoverage }>;
}
