import type { GithubBranchMergeClient } from '../../application/ports/github_branch_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import { Result } from '../model/result';
/**
 * Repository for merging branches: creates a PR, waits for that PR's check runs (or status checks),
 * then merges the PR; on failure, falls back to a direct Git merge.
 *
 * Check runs are filtered by PR (pull_requests) so we only wait for the current PR's checks,
 * not those of another PR sharing the same head (e.g. release→main vs release→develop).
 * If the PR has no check runs after a short wait, we proceed to merge (branch may have no required checks).
 *
 * @see docs/single-actions/deploy-label-and-merge.mdx for the deploy flow and check-wait behaviour.
 */
export declare class MergeRepository {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubBranchMergeClient>);
    mergeBranch: (owner: string, repository: string, head: string, base: string, timeout: number, token: string) => Promise<Result[]>;
}
