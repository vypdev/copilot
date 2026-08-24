export declare function versionFromReleaseBranch(branch: string): string;
export declare function versionFromHotfixOriginBranch(branch: string): string;
export declare function releaseBranch(tree: string, version: string | undefined): string;
export declare function hotfixOriginBranch(version: string): string;
export declare function hotfixBranch(tree: string, version: string | undefined): string;
