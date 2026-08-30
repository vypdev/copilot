import { logError } from "../../../utils/logger";
import { toPullRequestReviewOperationError } from "../../../application/ports/pull_request_review_errors";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubPullRequestChangesClient, GithubPullRequestFile } from "../../../infrastructure/github/ports/github_pull_request_provider_ports";
import { requireArrayPage } from "../github/github_pagination_policy";

export class PullRequestChangesRepository {
    constructor(private readonly githubClient: GithubClientPort<GithubPullRequestChangesClient>) {}

    private async listAllFiles(
        owner: string,
        repository: string,
        pullNumber: number,
        token: string,
    ): Promise<GithubPullRequestFile[]> {
        const octokit = this.githubClient.getClient(token);
        const allFiles: GithubPullRequestFile[] = [];
        for await (const response of octokit.paginate.iterator(octokit.rest.pulls.listFiles, {
            owner,
            repo: repository,
            pull_number: pullNumber,
            per_page: 100,
        })) {
            allFiles.push(...requireArrayPage<GithubPullRequestFile>(response.data, 'pull request files'));
        }
        return allFiles;
    }

    getChangedFiles = async (
        owner: string,
        repository: string,
        pullNumber: number,
        token: string
    ): Promise<{filename: string, status: string}[]> => {
        try {
            return (await this.listAllFiles(owner, repository, pullNumber, token))
                .map(({ filename, status }) => ({ filename, status }));
        } catch (error) {
            logError(`Error getting changed files from pull request: ${error}.`);
            throw toPullRequestReviewOperationError(error, "list-files");
        }
    };

    /** First line (right side) of the first hunk per file, for valid review comment placement. */
    private static firstLineFromPatch(patch: string): number | undefined {
        const match = patch.match(/^@@ -\d+,\d+ \+(\d+),\d+ @@/m);
        return match ? parseInt(match[1], 10) : undefined;
    }

    /**
     * Returns for each changed file the first line number that appears in the diff (right side).
     * Used so review comments use a line that GitHub can resolve (avoids "line could not be resolved").
     */
    getFilesWithFirstDiffLine = async (
        owner: string,
        repository: string,
        pullNumber: number,
        token: string
    ): Promise<Array<{ path: string; firstLine: number }>> => {
        try {
            return (await this.listAllFiles(owner, repository, pullNumber, token))
                .filter((f) => f.status !== 'removed' && (f.patch ?? '').length > 0)
                .map((f) => {
                    const firstLine = PullRequestChangesRepository.firstLineFromPatch(f.patch ?? '');
                    return { path: f.filename, firstLine: firstLine ?? 1 };
                });
        } catch (error) {
            logError(`Error getting files with diff lines (owner=${owner}, repo=${repository}, pullNumber=${pullNumber}): ${error}.`);
            throw toPullRequestReviewOperationError(error, "list-files");
        }
    };

    getPullRequestChanges = async (
        owner: string,
        repository: string,
        pullNumber: number,
        token: string
    ): Promise<Array<{
        filename: string,
        status: string,
        additions: number,
        deletions: number,
        patch: string
    }>> => {
        try {
            return (await this.listAllFiles(owner, repository, pullNumber, token))
                .map(({ filename, status, additions, deletions, patch }) => ({
                    filename,
                    status,
                    additions,
                    deletions,
                    patch: patch || '',
                }));
        } catch (error) {
            logError(`Error getting pull request changes: ${error}.`);
            throw toPullRequestReviewOperationError(error, "list-files");
        }
    };

    /** Head commit SHA of the PR (for creating review). */
    getPullRequestHeadSha = async (
        owner: string,
        repository: string,
        pullNumber: number,
        token: string
    ): Promise<string | undefined> => {
        const octokit = this.githubClient.getClient(token);
        try {
            const { data } = await octokit.rest.pulls.get({
                owner,
                repo: repository,
                pull_number: pullNumber,
            });
            if (!data.head?.sha) {
                throw new Error(`Pull request #${pullNumber} did not return a head commit SHA.`);
            }
            return data.head.sha;
        } catch (error) {
            logError(`Error getting PR head SHA: ${error}.`);
            throw toPullRequestReviewOperationError(error, "get-head-sha");
        }
    };

}
