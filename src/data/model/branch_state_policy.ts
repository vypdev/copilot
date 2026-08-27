export function versionFromReleaseBranch(branch: string): string {
    return branch.split('/')[1] ?? '';
}

export function versionFromHotfixOriginBranch(branch: string): string {
    return branch.split('/v')[1] ?? '';
}

export function releaseBranch(tree: string, version: string | undefined): string {
    return `${tree}/${version ?? ''}`;
}

export function hotfixOriginBranch(version: string): string {
    return `tags/v${version}`;
}

export function hotfixBranch(tree: string, version: string | undefined): string {
    return `${tree}/${version ?? ''}`;
}
