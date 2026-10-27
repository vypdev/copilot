import type { GithubProgressComparisonClient } from './ports/github_progress_comparison_provider_port';
import type { GithubProgressObjectClient } from './ports/github_progress_object_provider_port';
import { getOctokitClient } from "./octokit_client_resolver";
import type { GithubClientPort } from "./ports/github_client_provider_port";
import type { GithubBranchClient, GithubBranchComparisonClient } from "./ports/github_branch_provider_ports";

export class OctokitBranchClientAdapter implements GithubClientPort<GithubBranchClient> {
    getClient(token: string): GithubBranchClient { return getOctokitClient<GithubBranchClient>(token); }
}
export class OctokitBranchComparisonClientAdapter implements GithubClientPort<GithubBranchComparisonClient> {
    getClient(token: string): GithubBranchComparisonClient { return getOctokitClient<GithubBranchComparisonClient>(token); }
}

export class OctokitProgressObjectClientAdapter implements GithubClientPort<GithubProgressObjectClient> {
    getClient(token: string): GithubProgressObjectClient { return getOctokitClient(token); }
}

export class OctokitProgressComparisonClientAdapter implements GithubClientPort<GithubProgressComparisonClient> {
    getClient(token: string): GithubProgressComparisonClient { return getOctokitClient(token); }
}
