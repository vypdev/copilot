interface ParsedCliVersion {
    major: number;
    minor: number;
    patch: number;
    prerelease: string[];
}

const CLI_VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseCliVersion(version: string): ParsedCliVersion | undefined {
    const match = CLI_VERSION_PATTERN.exec(version.trim());
    if (!match) return undefined;

    return {
        major: Number.parseInt(match[1], 10),
        minor: Number.parseInt(match[2], 10),
        patch: Number.parseInt(match[3], 10),
        prerelease: match[4]?.split('.') ?? [],
    };
}

function comparePrereleaseIdentifiers(left: string, right: string): number {
    const leftNumber = /^\d+$/.test(left) ? Number.parseInt(left, 10) : undefined;
    const rightNumber = /^\d+$/.test(right) ? Number.parseInt(right, 10) : undefined;

    if (leftNumber !== undefined && rightNumber !== undefined) return Math.sign(leftNumber - rightNumber);
    if (leftNumber !== undefined) return -1;
    if (rightNumber !== undefined) return 1;
    return left < right ? -1 : left > right ? 1 : 0;
}

/** Compares two CLI versions using release and prerelease precedence. */
export function compareCliVersions(left: string, right: string): number | undefined {
    const leftVersion = parseCliVersion(left);
    const rightVersion = parseCliVersion(right);
    if (!leftVersion || !rightVersion) return undefined;

    for (const component of ['major', 'minor', 'patch'] as const) {
        if (leftVersion[component] !== rightVersion[component]) {
            return leftVersion[component] < rightVersion[component] ? -1 : 1;
        }
    }

    if (leftVersion.prerelease.length === 0 && rightVersion.prerelease.length > 0) return 1;
    if (leftVersion.prerelease.length > 0 && rightVersion.prerelease.length === 0) return -1;

    const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
    for (let index = 0; index < length; index += 1) {
        const leftIdentifier = leftVersion.prerelease[index];
        const rightIdentifier = rightVersion.prerelease[index];
        if (leftIdentifier === undefined) return -1;
        if (rightIdentifier === undefined) return 1;
        const comparison = comparePrereleaseIdentifiers(leftIdentifier, rightIdentifier);
        if (comparison !== 0) return comparison;
    }

    return 0;
}

/** Returns true only when the published version is newer than the installed one. */
export function isNewerCliVersion(installedVersion: string, publishedVersion: string): boolean {
    return compareCliVersions(installedVersion, publishedVersion) === -1;
}
