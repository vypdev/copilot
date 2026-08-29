import type { GithubBranchMergeClient } from '../../infrastructure/github/ports/github_branch_provider_ports';
import { logDebugInfo } from '../../utils/logger';

export interface CreatedPullRequest {
    readonly number: number;
}

export async function createMergePullRequest(
    client: GithubBranchMergeClient,
    owner: string,
    repository: string,
    head: string,
    base: string,
): Promise<CreatedPullRequest> {
    const { data } = await client.rest.pulls.create({
        owner,
        repo: repository,
        head,
        base,
        title: `Merge ${head} into ${base}`,
        body: buildPullRequestBody(head, base),
    });
    return data;
}

export async function updateMergePullRequestBody(
    client: GithubBranchMergeClient,
    owner: string,
    repository: string,
    pullRequestNumber: number,
    head: string,
    base: string,
): Promise<void> {
    logDebugInfo(`Pull request #${pullRequestNumber} created, getting commits...`);
    const { data: commits } = await client.rest.pulls.listCommits({
        owner,
        repo: repository,
        pull_number: pullRequestNumber,
    });
    const commitMessages = commits.map(commit => commit.commit.message);
    logDebugInfo(`Found ${commitMessages.length} commits in PR`);

    await client.rest.pulls.update({
        owner,
        repo: repository,
        pull_number: pullRequestNumber,
        body: `${buildPullRequestBody(head, base)}\n${commitMessages.map(message => `- ${message}`).join('\n')}` +
            '\n\nThis PR was automatically created by [`copilot`](https://github.com/vypdev/copilot).',
    });
}

export async function mergePullRequest(
    client: GithubBranchMergeClient,
    owner: string,
    repository: string,
    pullRequestNumber: number,
    head: string,
    base: string,
): Promise<void> {
    const { data } = await client.rest.pulls.merge({
        owner,
        repo: repository,
        pull_number: pullRequestNumber,
        merge_method: 'merge',
        commit_title: `Merge ${head} into ${base}. Forced merge with PAT token.`,
    });
    if (!data.merged) {
        throw new Error(`Pull request #${pullRequestNumber} was not merged: ${data.message ?? 'GitHub rejected the merge.'}`);
    }
}

function buildPullRequestBody(head: string, base: string): string {
    return `🚀 Automated Merge  \n\nThis PR merges **${head}** into **${base}**.  \n\n**Commits included:**`;
}
