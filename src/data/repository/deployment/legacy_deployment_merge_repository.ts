import type { LegacyManagedPullRequestPort } from "../../../application/ports/deployment_orchestration_ports";
import type { GithubBranchMergeClient } from "../../../infrastructure/github/ports/github_branch_provider_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import { MergeChecksWaiter } from "../merge_checks_waiter";
import { mergePullRequest } from "../merge_pull_request_flow";

interface ExistingPullRequestWaiter {
  wait(
    client: GithubBranchMergeClient,
    owner: string,
    repository: string,
    head: string,
    pullRequest: number,
    timeoutSeconds: number,
  ): Promise<void>;
}

export class LegacyDeploymentMergeRepository implements LegacyManagedPullRequestPort {
  constructor(
    private readonly clients: GithubClientPort<GithubBranchMergeClient>,
    private readonly waiter: ExistingPullRequestWaiter = new MergeChecksWaiter(),
  ) {}

  async waitAndMerge(
    owner: string,
    repository: string,
    headBranch: string,
    pullRequest: number,
    baseBranch: string,
    timeoutSeconds: number,
    token: string,
  ): Promise<void> {
    const client = this.clients.getClient(token);
    await this.waiter.wait(client, owner, repository, headBranch, pullRequest, timeoutSeconds);
    await mergePullRequest(client, owner, repository, pullRequest, headBranch, baseBranch);
  }
}
