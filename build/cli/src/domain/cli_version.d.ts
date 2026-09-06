/** Compares two CLI versions using release and prerelease precedence. */
export declare function compareCliVersions(left: string, right: string): number | undefined;
/** Returns true only when the published version is newer than the installed one. */
export declare function isNewerCliVersion(installedVersion: string, publishedVersion: string): boolean;
