import type { GithubClientPort } from "./ports/github_client_provider_port";
import type { GithubBranchClient, GithubBranchComparisonClient, GithubBranchMergeClient } from "./ports/github_branch_provider_ports";
export declare class OctokitBranchClientAdapter implements GithubClientPort<GithubBranchClient> {
    getClient(token: string): GithubBranchClient;
}
export declare class OctokitBranchComparisonClientAdapter implements GithubClientPort<GithubBranchComparisonClient> {
    getClient(token: string): GithubBranchComparisonClient;
}
export declare class OctokitBranchMergeClientAdapter implements GithubClientPort<GithubBranchMergeClient> {
    getClient(token: string): GithubBranchMergeClient;
}
