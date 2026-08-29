import type { GithubBranchMergeClient } from '../../infrastructure/github/ports/github_branch_provider_ports';
/** Polls only the checks relevant to one pull request before a merge. */
export declare class MergeChecksWaiter {
    wait(octokit: GithubBranchMergeClient, owner: string, repository: string, head: string, pullRequestNumber: number, timeout: number): Promise<void>;
    private statusChecksAreComplete;
    private logPendingCheckRuns;
    private logPendingStatusChecks;
    private waitForNextCheckPoll;
    private assertChecksPassed;
    private assertStatusChecksPassed;
}
