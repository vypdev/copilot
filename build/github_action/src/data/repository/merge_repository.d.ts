import type { GithubBranchMergeClient } from '../../infrastructure/github/ports/github_branch_provider_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import { Result } from '../model/result';
import { MergeChecksWaiter } from './merge_checks_waiter';
/**
 * Repository for merging branches: creates a PR, waits for that PR's check runs
 * (or status checks), then merges the PR. Direct merge is only attempted when
 * PR creation itself fails, before a PR exists and before checks can be evaluated.
 */
export declare class MergeRepository {
    private readonly githubClient;
    private readonly checksWaiter;
    constructor(githubClient: GithubClientPort<GithubBranchMergeClient>, checksWaiter?: MergeChecksWaiter);
    mergeBranch: (owner: string, repository: string, head: string, base: string, timeout: number, token: string) => Promise<Result[]>;
    private tryDirectMerge;
    private successResult;
    private mergeFailureResults;
}
