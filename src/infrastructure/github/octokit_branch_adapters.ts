import { getOctokitClient } from "./octokit_client_resolver";
import type { GithubClientPort } from "./ports/github_client_provider_port";
import type { GithubBranchClient, GithubBranchComparisonClient, GithubBranchMergeClient } from "./ports/github_branch_provider_ports";

export class OctokitBranchClientAdapter implements GithubClientPort<GithubBranchClient> {
    getClient(token: string): GithubBranchClient { return getOctokitClient<GithubBranchClient>(token); }
}
export class OctokitBranchComparisonClientAdapter implements GithubClientPort<GithubBranchComparisonClient> {
    getClient(token: string): GithubBranchComparisonClient { return getOctokitClient<GithubBranchComparisonClient>(token); }
}
export class OctokitBranchMergeClientAdapter implements GithubClientPort<GithubBranchMergeClient> {
    getClient(token: string): GithubBranchMergeClient { return getOctokitClient<GithubBranchMergeClient>(token); }
}
