import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubPullRequestChangesClient } from "../../../infrastructure/github/ports/github_pull_request_provider_ports";
export declare class PullRequestChangesRepository {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubPullRequestChangesClient>);
    private listAllFiles;
    getChangedFiles: (owner: string, repository: string, pullNumber: number, token: string) => Promise<{
        filename: string;
        status: string;
    }[]>;
    /** First line (right side) of the first hunk per file, for valid review comment placement. */
    private static firstLineFromPatch;
    /**
     * Returns for each changed file the first line number that appears in the diff (right side).
     * Used so review comments use a line that GitHub can resolve (avoids "line could not be resolved").
     */
    getFilesWithFirstDiffLine: (owner: string, repository: string, pullNumber: number, token: string) => Promise<Array<{
        path: string;
        firstLine: number;
    }>>;
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
