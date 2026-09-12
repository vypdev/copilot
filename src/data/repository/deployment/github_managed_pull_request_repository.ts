import type {
  ManagedPullRequestCreate,
  ManagedPullRequestPort,
  ManagedPullRequestQuery,
  ManagedPullRequestRecord,
} from "../../../application/ports/deployment_orchestration_ports";
import { parseManagedPullRequestMarker } from "../../../domain/managed_pull_request";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type {
  GithubDeploymentClient,
  GithubDeploymentPullRequest,
} from "../../../infrastructure/github/ports/github_deployment_provider_port";

export class GithubManagedPullRequestRepository implements ManagedPullRequestPort {
  constructor(private readonly clientProvider: GithubClientPort<GithubDeploymentClient>) {}

  async findManagedPullRequests(query: ManagedPullRequestQuery): Promise<readonly ManagedPullRequestRecord[]> {
    const client = this.clientProvider.getClient(query.token);
    const pullRequests = await client.paginate(client.rest.pulls.list, {
      owner: query.owner,
      repo: query.repository,
      state: "all",
      head: `${query.owner}:${query.headBranch}`,
      base: query.baseBranch,
      per_page: 100,
    });
    return pullRequests
      .filter((pullRequest) => {
        const marker = parseManagedPullRequestMarker(pullRequest.body);
        return marker?.operationId === query.operationId
          && marker.phase === query.phase
          && marker.issue === query.issue;
      })
      .map((pullRequest) => mapPullRequest(pullRequest, query.owner, query.repository));
  }

  async createManagedPullRequest(command: ManagedPullRequestCreate): Promise<ManagedPullRequestRecord> {
    const { data } = await this.clientProvider.getClient(command.token).rest.pulls.create({
      owner: command.owner,
      repo: command.repository,
      head: command.headBranch,
      base: command.baseBranch,
      title: command.title,
      body: command.body,
      maintainer_can_modify: false,
    });
    return mapPullRequest(data, command.owner, command.repository);
  }

  async getPullRequest(
    owner: string,
    repository: string,
    pullRequest: number,
    token: string,
  ): Promise<ManagedPullRequestRecord> {
    const { data } = await this.clientProvider.getClient(token).rest.pulls.get({
      owner,
      repo: repository,
      pull_number: pullRequest,
    });
    return mapPullRequest(data, owner, repository);
  }

  async enableAutoMerge(owner: string, repository: string, pullRequestNodeId: string, token: string): Promise<void> {
    await this.clientProvider.getClient(token).graphql(
      `mutation EnableDeploymentAutoMerge($pullRequestId: ID!) {
        enablePullRequestAutoMerge(input: {pullRequestId: $pullRequestId, mergeMethod: MERGE}) {
          pullRequest { id }
        }
      }`,
      { pullRequestId: pullRequestNodeId, owner, repository },
    );
  }

  async isPullRequestQueued(owner: string, repository: string, pullRequestNodeId: string, token: string): Promise<boolean> {
    const response = await this.clientProvider.getClient(token).graphql<{
      node?: { mergeQueueEntry?: { id?: string } | null } | null;
    }>(
      `query DeploymentPullRequestQueue($pullRequestId: ID!) {
        node(id: $pullRequestId) {
          ... on PullRequest { mergeQueueEntry { id } }
        }
      }`,
      { pullRequestId: pullRequestNodeId },
    );
    if (!response.node || !("mergeQueueEntry" in response.node)) {
      throw new Error("GitHub returned no authoritative merge-queue membership for the pull request.");
    }
    return Boolean(response.node.mergeQueueEntry?.id);
  }

  async enqueuePullRequest(
    owner: string,
    repository: string,
    pullRequestNodeId: string,
    expectedHeadSha: string,
    token: string,
  ): Promise<void> {
    const response = await this.clientProvider.getClient(token).graphql<{
      enqueuePullRequest?: { mergeQueueEntry?: { id?: string } | null } | null;
    }>(
      `mutation EnqueueDeploymentPullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) {
        enqueuePullRequest(input: {pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid}) {
          mergeQueueEntry { id }
        }
      }`,
      { pullRequestId: pullRequestNodeId, expectedHeadOid: expectedHeadSha, owner, repository },
    );
    if (!response.enqueuePullRequest?.mergeQueueEntry?.id) {
      throw new Error("GitHub did not confirm that the pull request entered the merge queue.");
    }
  }

  async mergePullRequest(owner: string, repository: string, pullRequest: number, token: string): Promise<string> {
    const { data } = await this.clientProvider.getClient(token).rest.pulls.merge({
      owner,
      repo: repository,
      pull_number: pullRequest,
      merge_method: "merge",
    });
    if (!data.merged || !data.sha) throw new Error(data.message ?? `Pull request #${pullRequest} was not merged.`);
    return data.sha;
  }
}

function mapPullRequest(
  value: GithubDeploymentPullRequest,
  owner: string,
  repository: string,
): ManagedPullRequestRecord {
  return {
    number: value.number,
    nodeId: value.node_id,
    body: value.body ?? "",
    headBranch: value.head.ref,
    headSha: value.head.sha,
    baseBranch: value.base.ref,
    state: value.state === "closed" ? "closed" : "open",
    merged: value.merged === true,
    autoMergeEnabled: value.auto_merge !== null && value.auto_merge !== undefined,
    mergeCommitSha: value.merge_commit_sha ?? undefined,
    repositoryFullName: value.base.repo?.full_name ?? value.head.repo?.full_name ?? `${owner}/${repository}`,
  };
}
