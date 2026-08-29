/**
 * Repository for Git operations executed via CLI (exec).
 * Isolated to allow unit tests with mocked @actions/exec.
 */
export declare class GitCliRepository {
    fetchRemoteBranches: () => Promise<void>;
    getLatestTag: () => Promise<string | undefined>;
    getCommitTag: (latestTag: string | undefined) => Promise<string | undefined>;
}
