export type GitInfo = {
    owner: string;
    repo: string;
} | {
    error: string;
};
export declare function cleanCliArg(value: unknown): string;
export declare function getGitInfo(): GitInfo;
export declare function getCurrentBranch(): string;
export declare function isInsideGitRepo(cwd: string): boolean;
