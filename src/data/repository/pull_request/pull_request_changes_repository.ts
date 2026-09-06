import { logError } from "../../../utils/logger";
import { toPullRequestReviewOperationError } from "../../../application/ports/pull_request_review_errors";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubPullRequestChangesClient, GithubPullRequestFile } from "../../../infrastructure/github/ports/github_pull_request_provider_ports";
import { requireArrayPage } from "../github/github_pagination_policy";
import type {
    PullRequestDiffLocation,
    PullRequestReviewChange,
    PullRequestReviewDiffSnapshot,
} from '../../../application/ports/bugbot_pull_request_read_ports';

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

    /** First commentable right-side line of the first hunk in a GitHub patch. */
    private static firstLineFromPatch(patch: string): number | undefined {
        const lines = patch.split('\n');
        for (let index = 0; index < lines.length; index += 1) {
            const match = lines[index].match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
            if (!match) continue;
            const start = parseInt(match[1], 10);
            const rightCount = match[2] === undefined ? 1 : parseInt(match[2], 10);
            let rightLine = start;
            for (let bodyIndex = index + 1; bodyIndex < lines.length && !lines[bodyIndex].startsWith('@@ '); bodyIndex += 1) {
                const line = lines[bodyIndex];
                if (line.startsWith('+') && !line.startsWith('+++')) return rightLine;
                if (line.startsWith(' ')) return rightLine;
                if (!line.startsWith('-') && !line.startsWith('\\')) rightLine += 1;
            }
            return rightCount > 0 ? start : undefined;
        }
        return undefined;
    }

    /** Every line GitHub can address in the split diff, on both sides. */
    private static locationsFromPatch(patch: string): PullRequestDiffLocation[] {
        const locations: PullRequestDiffLocation[] = [];
        let oldLine = 0;
        let newLine = 0;
        let insideHunk = false;
        for (const patchLine of patch.split('\n')) {
            const header = patchLine.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (header) {
                oldLine = Number.parseInt(header[1], 10);
                newLine = Number.parseInt(header[2], 10);
                insideHunk = true;
                continue;
            }
            if (!insideHunk || patchLine.startsWith('\\')) continue;
            if (patchLine.startsWith('-')) {
                locations.push({ line: oldLine, side: 'LEFT' });
                oldLine += 1;
                continue;
            }
            if (patchLine.startsWith('+')) {
                locations.push({ line: newLine, side: 'RIGHT' });
                newLine += 1;
                continue;
            }
            locations.push({ line: newLine, side: 'RIGHT' });
            oldLine += 1;
            newLine += 1;
        }
        return locations;
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
                .flatMap((f) => {
                    const firstLine = PullRequestChangesRepository.firstLineFromPatch(f.patch ?? '');
                    return firstLine === undefined ? [] : [{ path: f.filename, firstLine }];
                });
        } catch (error) {
            logError(`Error getting files with diff lines (owner=${owner}, repo=${repository}, pullNumber=${pullNumber}): ${error}.`);
            throw toPullRequestReviewOperationError(error, "list-files");
        }
    };

    getFilesWithDiffLocations = async (
        owner: string,
        repository: string,
        pullNumber: number,
        token: string,
    ): Promise<Array<{ path: string; locations: PullRequestDiffLocation[] }>> => {
        try {
            return (await this.listAllFiles(owner, repository, pullNumber, token))
                .flatMap((file) => {
                    const locations = PullRequestChangesRepository.locationsFromPatch(file.patch ?? '');
                    return locations.length === 0 ? [] : [{ path: file.filename, locations }];
                });
        } catch (error) {
            logError(`Error getting files with diff locations (owner=${owner}, repo=${repository}, pullNumber=${pullNumber}): ${error}.`);
            throw toPullRequestReviewOperationError(error, 'list-files');
        }
    };

    getReviewDiffSnapshot = async (
        owner: string,
        repository: string,
        pullNumber: number,
        token: string,
    ): Promise<PullRequestReviewDiffSnapshot> => {
        try {
            const files = await this.listAllFiles(owner, repository, pullNumber, token);
            const changes: PullRequestReviewChange[] = files.map(({ filename, status, additions, deletions, patch }) => ({
                filename,
                status,
                additions,
                deletions,
                patch: patch || '',
            }));
            const filesWithFirstDiffLine = files.flatMap((file) => {
                if (file.status === 'removed' || !file.patch) return [];
                const firstLine = PullRequestChangesRepository.firstLineFromPatch(file.patch);
                return firstLine === undefined ? [] : [{ path: file.filename, firstLine }];
            });
            const filesWithDiffLocations = files.flatMap((file) => {
                const locations = PullRequestChangesRepository.locationsFromPatch(file.patch ?? '');
                return locations.length === 0 ? [] : [{ path: file.filename, locations }];
            });
            return { changes, filesWithFirstDiffLine, filesWithDiffLocations };
        } catch (error) {
            logError(`Error getting pull request review diff snapshot: ${error}.`);
            throw toPullRequestReviewOperationError(error, 'list-files');
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
