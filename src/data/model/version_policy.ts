/** Default base version when the repository has no existing tags. */
export const DEFAULT_BASE_VERSION = '1.0.0';

/** Default initial tag name used during repository setup. */
export const DEFAULT_INITIAL_TAG = `v${DEFAULT_BASE_VERSION}`;

export const incrementVersion = (version: string, releaseType: string): string => {
    const versionParts = version.split('.').map(Number);

    if (versionParts.length !== 3 || versionParts.some(Number.isNaN)) {
        throw new Error('Invalid version format');
    }

    const [major, minor, patch] = versionParts;

    switch (releaseType) {
        case 'Major':
            return `${major + 1}.0.0`;
        case 'Minor':
            return `${major}.${minor + 1}.0`;
        case 'Patch':
            return `${major}.${minor}.${patch + 1}`;
        default:
            throw new Error('Unknown release type');
    }
};

export const getLatestVersion = (versions: string[]): string | undefined => {
    return versions
        .map(version => version.split('.').map(num => Number.parseInt(num, 10)))
        .sort((a, b) => {
            for (let i = 0; i < 3; i++) {
                if (a[i] > b[i]) return 1;
                if (a[i] < b[i]) return -1;
            }
            return 0;
        })
        .map(version => version.join('.'))
        .pop();
};
