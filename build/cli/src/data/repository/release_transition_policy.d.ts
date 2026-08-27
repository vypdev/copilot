export interface ExistingRelease {
    id: number;
}
export declare function findTargetRelease<T extends ExistingRelease>(releases: T[], targetTag: string, tagOf: (release: T) => string): T | undefined;
export declare function releaseIdAsString(id: number): string;
