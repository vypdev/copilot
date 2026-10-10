import { isGithubPermissionDenied } from '../data/repository/github/github_error_policy';

/** Provider prose is used privately for classification, never as presentation text. */
export async function isSetupPermissionDenied(response: Response): Promise<boolean> {
    try {
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
        const raw = (body as Record<string, unknown>).message;
        if (typeof raw !== 'string') return false;
        const message = raw.trim().slice(0, 256);
        if (message.toLowerCase() === 'forbidden') return false;
        const headers = Object.fromEntries(['retry-after', 'x-ratelimit-remaining', 'x-github-sso']
            .map(name => [name, response.headers.get(name)] as const)
            .filter((entry): entry is readonly [string, string] => entry[1] !== null));
        return isGithubPermissionDenied({ status: response.status, message, response: { headers } });
    } catch { return false; }
}
