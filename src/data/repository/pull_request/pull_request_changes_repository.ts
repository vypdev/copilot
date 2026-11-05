import { toPullRequestReviewOperationError } from './pull_request_review_error_metadata';
import { logError } from "../../../utils/logger";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubPullRequestChangesClient, GithubPullRequestFile } from "../../../infrastructure/github/ports/github_pull_request_provider_ports";
import { requireArrayPage } from "../github/github_pagination_policy";
import type {
    PullRequestDiffLocation,
    PullRequestReviewChange,
    PullRequestReviewDiffSnapshot,
} from '../../../application/ports/bugbot_pull_request_read_ports';
import { toApplicationError } from '../../../application/errors/application_error';
import type { BugbotSourceCoverage } from '../../../domain/bugbot/context';
import { canonicalGitObjectId } from '../../../domain/git_object_id';

const GITHUB_PULL_REQUEST_FILES_PER_PAGE = 100;
// https://docs.github.com/en/rest/pulls/pulls#list-pull-requests-files
const GITHUB_PULL_REQUEST_FILE_LIMIT = 3_000;

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

    getReviewDiffSnapshot = async (
        owner: string,
        repository: string,
        pullNumber: number,
        token: string,
    ): Promise<PullRequestReviewDiffSnapshot> => {
        try {
            const files = await this.listAllFiles(owner, repository, pullNumber, token);
            return PullRequestChangesRepository.toSnapshot(files);
        } catch (error) {
            logError(toApplicationError(error, 'provider.unavailable', 'Unable to read the pull request review diff.'));
            throw toPullRequestReviewOperationError(error, 'list-files');
        }
    };

    getBoundedBugbotReviewDiffSnapshot = async (
        owner: string,
        repository: string,
        pullNumber: number,
        token: string,
        expectedHeadSha?: string,
    ): Promise<{ readonly snapshot: PullRequestReviewDiffSnapshot; readonly coverage: BugbotSourceCoverage }> => {
        const octokit = this.githubClient.getClient(token);
        const target = { owner, repo: repository, pull_number: pullNumber };
        try {
            const { data: before } = await octokit.rest.pulls.get(target);
            const headSha = canonicalGitObjectId(before.head?.sha);
            const baseSha = canonicalGitObjectId(before.base?.sha);
            const changedFiles = before.changed_files;
            if (!headSha || !baseSha || changedFiles === undefined || !Number.isSafeInteger(changedFiles) || changedFiles < 0) {
                throw new Error('GitHub did not return a verifiable pull request file count and revision.');
            }
            if (expectedHeadSha !== undefined && headSha !== expectedHeadSha) {
                throw new Error('The pull request head changed before its diff was read.');
            }

            const files: GithubPullRequestFile[] = [];
            let pagesFetched = 0;
            const fileLimit = Math.min(changedFiles, GITHUB_PULL_REQUEST_FILE_LIMIT);
            const pageLimit = Math.ceil(fileLimit / GITHUB_PULL_REQUEST_FILES_PER_PAGE);
            for (let page = 1; page <= pageLimit; page += 1) {
                const response = await octokit.rest.pulls.listFiles({
                    ...target,
                    per_page: GITHUB_PULL_REQUEST_FILES_PER_PAGE,
                    page,
                });
                const records = requireArrayPage<GithubPullRequestFile>(response.data, 'pull request files');
                if (records.length > GITHUB_PULL_REQUEST_FILES_PER_PAGE || records.length > fileLimit - files.length) {
                    throw new Error('GitHub returned more pull request files than expected.');
                }
                pagesFetched += 1;
                files.push(...records);
                if (records.length < GITHUB_PULL_REQUEST_FILES_PER_PAGE) break;
            }

            // GitHub's files endpoint takes a PR number, so verify that pagination
            // did not cross an observed head, base or file-count change.
            const { data: after } = await octokit.rest.pulls.get(target);
            if (canonicalGitObjectId(after.head?.sha) !== headSha || canonicalGitObjectId(after.base?.sha) !== baseSha
                || after.base?.ref !== before.base?.ref || after.changed_files !== changedFiles) {
                throw new Error('The pull request revision or file count changed while its diff was read.');
            }
            if (new Set(files.map(file => file.filename)).size !== files.length) {
                throw new Error('GitHub returned duplicate paths while listing pull request files.');
            }

            const omittedItems = changedFiles - files.length;
            const providerLimitReached = changedFiles > GITHUB_PULL_REQUEST_FILE_LIMIT
                && files.length === GITHUB_PULL_REQUEST_FILE_LIMIT;
            return {
                snapshot: PullRequestChangesRepository.toSnapshot(files),
                coverage: {
                    source: 'diff',
                    status: omittedItems > 0 ? 'partial' : 'complete',
                    pagesFetched,
                    itemsFetched: files.length,
                    itemsRetained: files.length,
                    omittedItems,
                    truncatedItems: 0,
                    limitReached: providerLimitReached,
                    ...(providerLimitReached ? { providerLimitReached: true } : {}),
                },
            };
        } catch (error) {
            logError(toApplicationError(error, 'provider.unavailable', 'Unable to read the pull request review diff.'));
            throw toPullRequestReviewOperationError(error, 'list-files');
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
            logError(toApplicationError(error, 'provider.unavailable', 'Unable to read the pull request head SHA.'));
            throw toPullRequestReviewOperationError(error, "get-head-sha");
        }
    };

    private static toSnapshot(files: readonly GithubPullRequestFile[]): PullRequestReviewDiffSnapshot {
        const changes: PullRequestReviewChange[] = files.map(({ filename, status, additions, deletions, patch, previous_filename }) => ({
            filename,
            status,
            additions,
            deletions,
            patch: patch || '',
            ...(previous_filename === undefined ? {} : { previousFilename: previous_filename }),
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
    }

}
