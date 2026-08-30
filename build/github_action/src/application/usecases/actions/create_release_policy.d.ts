export interface ReleaseInput {
    version: string;
    title: string;
    changelog: string;
}
export declare function validateReleaseInput(input: ReleaseInput): string | undefined;
export declare function normalizeVersion(version: string): string | undefined;
export declare function versionForRelease(version: string): string;
