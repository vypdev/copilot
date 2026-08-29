import type { GithubBranchMergeClient } from '../../infrastructure/github/ports/github_branch_provider_ports';
export interface CreatedPullRequest {
    readonly number: number;
}
export declare function createMergePullRequest(client: GithubBranchMergeClient, owner: string, repository: string, head: string, base: string): Promise<CreatedPullRequest>;
export declare function updateMergePullRequestBody(client: GithubBranchMergeClient, owner: string, repository: string, pullRequestNumber: number, head: string, base: string): Promise<void>;
export declare function mergePullRequest(client: GithubBranchMergeClient, owner: string, repository: string, pullRequestNumber: number, head: string, base: string): Promise<void>;
