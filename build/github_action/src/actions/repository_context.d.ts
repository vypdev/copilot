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
export declare function requireRepositoryCoordinates(value: unknown): RepositoryCoordinates;
