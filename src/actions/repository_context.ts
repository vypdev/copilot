export interface RepositoryCoordinates {
    owner: string;
    repo: string;
}

/**
 * Validates and normalizes repository coordinates at an action boundary.
 *
 * GitHub Actions and the local CLI provide the same information through
 * different runtime objects. Keeping this conversion in one pure helper
 * prevents downstream ports from silently receiving an empty owner/repo.
 */
export function requireRepositoryCoordinates(value: unknown): RepositoryCoordinates {
    if (!value || typeof value !== 'object') {
        throw new Error('Repository context requires a non-empty owner and repository.');
    }

    const candidate = value as Record<string, unknown>;
    const owner = typeof candidate.owner === 'string' ? candidate.owner.trim() : '';
    const repo = typeof candidate.repo === 'string' ? candidate.repo.trim() : '';

    if (!owner || !repo) {
        throw new Error('Repository context requires a non-empty owner and repository.');
    }

    return { owner, repo };
}
