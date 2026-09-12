import { ApplicationError } from "../../../application/errors/application_error";
import type { DeploymentGitPort } from "../../../application/ports/deployment_orchestration_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubDeploymentClient } from "../../../infrastructure/github/ports/github_deployment_provider_port";

export class GithubDeploymentGitRepository implements DeploymentGitPort {
  constructor(private readonly clientProvider: GithubClientPort<GithubDeploymentClient>) {}

  async getBranchSha(owner: string, repository: string, branch: string, token: string): Promise<string> {
    const { data } = await this.clientProvider.getClient(token).rest.git.getRef({
      owner,
      repo: repository,
      ref: `heads/${branch}`,
    });
    return data.object.sha;
  }

  async getMergeBaseSha(owner: string, repository: string, base: string, head: string, token: string): Promise<string> {
    const { data } = await this.clientProvider.getClient(token).rest.repos.compareCommits({
      owner,
      repo: repository,
      base,
      head,
    });
    const sha = data.merge_base_commit?.sha;
    if (!sha) throw new Error(`GitHub returned no merge base for ${base}...${head}.`);
    return sha;
  }

  async isCommitReachable(owner: string, repository: string, branch: string, sha: string, token: string): Promise<boolean> {
    const { data } = await this.clientProvider.getClient(token).rest.repos.compareCommits({
      owner,
      repo: repository,
      base: sha,
      head: branch,
    });
    return data.merge_base_commit?.sha === sha;
  }

  async createOrVerifyBranch(owner: string, repository: string, branch: string, sha: string, token: string): Promise<void> {
    const client = this.clientProvider.getClient(token);
    try {
      const { data } = await client.rest.git.getRef({ owner, repo: repository, ref: `heads/${branch}` });
      if (data.object.sha !== sha) {
        const { data: comparison } = await client.rest.repos.compareCommits({
          owner,
          repo: repository,
          base: sha,
          head: branch,
        });
        if (comparison.merge_base_commit?.sha !== sha) {
          throw new Error(`Branch ${branch} already exists at a different SHA.`);
        }
      }
    } catch (error) {
      if (!isNotFound(error)) throw error;
      await client.rest.git.createRef({ owner, repo: repository, ref: `refs/heads/${branch}`, sha });
    }
  }

  async mergeCommitIntoBranch(
    owner: string,
    repository: string,
    branch: string,
    sourceSha: string,
    token: string,
  ): Promise<string> {
    const client = this.clientProvider.getClient(token);
    const { data: comparison } = await client.rest.repos.compareCommits({
      owner,
      repo: repository,
      base: sourceSha,
      head: branch,
    });
    if (comparison.merge_base_commit?.sha === sourceSha) {
      return await this.getBranchSha(owner, repository, branch, token);
    }
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

  async deleteBranch(owner: string, repository: string, branch: string, expectedSha: string, token: string): Promise<void> {
    const client = this.clientProvider.getClient(token);
    try {
      const { data } = await client.rest.git.getRef({ owner, repo: repository, ref: `heads/${branch}` });
      if (data.object.sha !== expectedSha) {
        throw new ApplicationError(
          "provider.conflict",
          `Branch ${branch} moved to ${data.object.sha}; refusing cleanup expected at ${expectedSha}.`,
        );
      }
      await client.rest.git.deleteRef({ owner, repo: repository, ref: `heads/${branch}` });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async listBranches(owner: string, repository: string, prefix: string, token: string): Promise<readonly string[]> {
    const client = this.clientProvider.getClient(token);
    const branches = await client.paginate(client.rest.repos.listBranches, {
      owner,
      repo: repository,
      per_page: 100,
    });
    return branches.map(({ name }) => name).filter((name) => name.startsWith(`${prefix}/`));
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "status" in error
    && (error as { status?: number }).status === 404;
}
