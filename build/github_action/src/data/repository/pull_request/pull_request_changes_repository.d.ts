import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubPullRequestChangesClient } from "../../../infrastructure/github/ports/github_pull_request_provider_ports";
import type { PullRequestDiffLocation, PullRequestReviewDiffSnapshot } from '../../../application/ports/bugbot_pull_request_read_ports';
export declare class PullRequestChangesRepository {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubPullRequestChangesClient>);
    private listAllFiles;
    getChangedFiles: (owner: string, repository: string, pullNumber: number, token: string) => Promise<{
        filename: string;
        status: string;
    }[]>;
    /** First commentable right-side line of the first hunk in a GitHub patch. */
    private static firstLineFromPatch;
    /** Every line GitHub can address in the split diff, on both sides. */
    private static locationsFromPatch;
    /**
     * Returns for each changed file the first line number that appears in the diff (right side).
     * Used so review comments use a line that GitHub can resolve (avoids "line could not be resolved").
     */
    getFilesWithFirstDiffLine: (owner: string, repository: string, pullNumber: number, token: string) => Promise<Array<{
        path: string;
        firstLine: number;
    }>>;
    getFilesWithDiffLocations: (owner: string, repository: string, pullNumber: number, token: string) => Promise<Array<{
        path: string;
        locations: PullRequestDiffLocation[];
    }>>;
    getReviewDiffSnapshot: (owner: string, repository: string, pullNumber: number, token: string) => Promise<PullRequestReviewDiffSnapshot>;
    getPullRequestChanges: (owner: string, repository: string, pullNumber: number, token: string) => Promise<Array<{
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        patch: string;
    }>>;
    /** Head commit SHA of the PR (for creating review). */
    getPullRequestHeadSha: (owner: string, repository: string, pullNumber: number, token: string) => Promise<string | undefined>;
}
