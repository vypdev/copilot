import type {
  DeploymentGitPort,
  ManagedPullRequestCreate,
  ManagedPullRequestPort,
  ManagedPullRequestQuery,
  ManagedPullRequestRecord,
} from "../../../application/ports/deployment_orchestration_ports";
import type { TargetMergeCapabilities } from "../../../application/policies/deployment_plan_policy";
import { parseManagedPullRequestMarker } from "../../../domain/managed_pull_request";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type {
  GithubDeploymentClient,
  GithubDeploymentPullRequest,
} from "../../../infrastructure/github/ports/github_deployment_provider_port";

export class GithubDeploymentRepository implements ManagedPullRequestPort, DeploymentGitPort {
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
    const client = this.clientProvider.getClient(command.token);
    const { data } = await client.rest.pulls.create({
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

  async getPullRequest(owner: string, repository: string, pullRequest: number, token: string): Promise<ManagedPullRequestRecord> {
    const { data } = await this.clientProvider.getClient(token).rest.pulls.get({
      owner,
      repo: repository,
      pull_number: pullRequest,
    });
    return mapPullRequest(data, owner, repository);
  }

  async getTargetCapabilities(owner: string, repository: string, targetBranch: string, token: string, pullRequest?: number): Promise<TargetMergeCapabilities> {
    const client = this.clientProvider.getClient(token);
    const [{ data: repositoryData }, protection, queue, pullRequestState] = await Promise.all([
      client.rest.repos.get({ owner, repo: repository }),
      readBranchProtection(client, owner, repository, targetBranch),
      readMergeQueueRequirement(client, owner, repository, targetBranch),
      pullRequest === undefined
        ? Promise.resolve(undefined)
        : client.rest.pulls.get({ owner, repo: repository, pull_number: pullRequest }).then(({ data }) => data),
    ]);
    return {
      autoMergeAllowed: repositoryData.allow_auto_merge === true,
      mergeQueueRequired: queue,
      immediatelyMergeable: pullRequestState?.mergeable === true && pullRequestState.mergeable_state === "clean",
      requiresStrictStatusChecks: protection?.required_status_checks?.strict === true,
    };
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

  async enqueuePullRequest(owner: string, repository: string, pullRequestNodeId: string, token: string): Promise<void> {
    await this.clientProvider.getClient(token).graphql(
      `mutation EnqueueDeploymentPullRequest($pullRequestId: ID!) {
        enqueuePullRequest(input: {pullRequestId: $pullRequestId}) { mergeQueueEntry { id } }
      }`,
      { pullRequestId: pullRequestNodeId, owner, repository },
    );
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

  async getBranchSha(owner: string, repository: string, branch: string, token: string): Promise<string> {
    const { data } = await this.clientProvider.getClient(token).rest.git.getRef({ owner, repo: repository, ref: `heads/${branch}` });
    return data.object.sha;
  }

  async getMergeBaseSha(owner: string, repository: string, base: string, head: string, token: string): Promise<string> {
    const { data } = await this.clientProvider.getClient(token).rest.repos.compareCommits({ owner, repo: repository, base, head });
    const sha = data.merge_base_commit?.sha;
    if (!sha) throw new Error(`GitHub returned no merge base for ${base}...${head}.`);
    return sha;
  }

  async isCommitReachable(owner: string, repository: string, branch: string, sha: string, token: string): Promise<boolean> {
    const { data } = await this.clientProvider.getClient(token).rest.repos.compareCommits({ owner, repo: repository, base: sha, head: branch });
    return data.merge_base_commit?.sha === sha;
  }

  async createOrVerifyBranch(owner: string, repository: string, branch: string, sha: string, token: string): Promise<void> {
    const client = this.clientProvider.getClient(token);
    try {
      const { data } = await client.rest.git.getRef({ owner, repo: repository, ref: `heads/${branch}` });
      if (data.object.sha !== sha) {
        const { data: comparison } = await client.rest.repos.compareCommits({ owner, repo: repository, base: sha, head: branch });
        if (comparison.merge_base_commit?.sha !== sha) throw new Error(`Branch ${branch} already exists at a different SHA.`);
      }
    } catch (error) {
      if (!isNotFound(error)) throw error;
      await client.rest.git.createRef({ owner, repo: repository, ref: `refs/heads/${branch}`, sha });
    }
  }

  async mergeCommitIntoBranch(owner: string, repository: string, branch: string, sourceSha: string, token: string): Promise<string> {
    const client = this.clientProvider.getClient(token);
    const { data: comparison } = await client.rest.repos.compareCommits({ owner, repo: repository, base: sourceSha, head: branch });
    if (comparison.merge_base_commit?.sha === sourceSha) return await this.getBranchSha(owner, repository, branch, token);
    const { data } = await client.rest.repos.merge({
      owner,
      repo: repository,
      base: branch,
      head: sourceSha,
      commit_message: `chore(release): reconcile ${sourceSha.slice(0, 7)} into ${branch}`,
    });
    if (!data.merged || !data.sha) throw new Error(data.message ?? `Could not reconcile ${sourceSha} into ${branch}.`);
    return data.sha;
  }

  async deleteBranch(owner: string, repository: string, branch: string, token: string): Promise<void> {
    try {
      await this.clientProvider.getClient(token).rest.git.deleteRef({ owner, repo: repository, ref: `heads/${branch}` });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async listBranches(owner: string, repository: string, prefix: string, token: string): Promise<readonly string[]> {
    const client = this.clientProvider.getClient(token);
    const branches = await client.paginate(client.rest.repos.listBranches, { owner, repo: repository, per_page: 100 });
    return branches.map(({ name }) => name).filter((name) => name.startsWith(`${prefix}/`));
  }
}

function mapPullRequest(value: GithubDeploymentPullRequest, owner: string, repository: string): ManagedPullRequestRecord {
  return {
    number: value.number,
    nodeId: value.node_id,
    body: value.body ?? "",
    headBranch: value.head.ref,
    headSha: value.head.sha,
    baseBranch: value.base.ref,
    state: value.state === "closed" ? "closed" : "open",
    merged: value.merged === true,
    mergeCommitSha: value.merge_commit_sha ?? undefined,
    repositoryFullName: value.base.repo?.full_name ?? value.head.repo?.full_name ?? `${owner}/${repository}`,
  };
}

async function readBranchProtection(
  client: GithubDeploymentClient,
  owner: string,
  repository: string,
  branch: string,
): Promise<{ required_status_checks?: { strict?: boolean } | null } | undefined> {
  try {
    return (await client.rest.repos.getBranchProtection({ owner, repo: repository, branch })).data;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

async function readMergeQueueRequirement(
  client: GithubDeploymentClient,
  owner: string,
  repository: string,
  branch: string,
): Promise<boolean> {
  const response = await client.graphql<{ repository?: { ref?: { branchProtectionRule?: { requiresMergeQueue?: boolean } | null } | null } }>(
    `query DeploymentTargetRules($owner: String!, $repository: String!, $qualifiedName: String!) {
      repository(owner: $owner, name: $repository) {
        ref(qualifiedName: $qualifiedName) { branchProtectionRule { requiresMergeQueue } }
      }
    }`,
    { owner, repository, qualifiedName: `refs/heads/${branch}` },
  );
  return response.repository?.ref?.branchProtectionRule?.requiresMergeQueue === true;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 404;
}
