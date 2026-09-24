import type { SetupGithubIdentity, SetupGithubIdentityQueryPort } from '../application/ports/setup_pat_identity_ports';

const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export class SetupGithubIdentityQueryAdapter implements SetupGithubIdentityQueryPort {
    constructor(private readonly fetcher: typeof fetch = fetch, private readonly timeoutMs = 10_000) {}

    async resolve(login: string, setupToken: string): Promise<SetupGithubIdentity> {
        if (!LOGIN_PATTERN.test(login)) throw new Error('Enter a valid GitHub bot account login.');
        return this.request(`https://api.github.com/users/${encodeURIComponent(login)}`, setupToken);
    }

    identify(token: string): Promise<SetupGithubIdentity> {
        return this.request('https://api.github.com/user', token);
    }

    private async request(url: string, token: string): Promise<SetupGithubIdentity> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetcher(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
                signal: controller.signal,
            });
            if (!response.ok) throw new Error('GitHub could not verify the selected bot account or token identity. No Secret was written.');
            const body: unknown = await response.json();
            if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('GitHub returned an invalid identity. No Secret was written.');
            const { id, login } = body as Record<string, unknown>;
            if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || typeof login !== 'string' || !LOGIN_PATTERN.test(login)) {
                throw new Error('GitHub returned an invalid identity. No Secret was written.');
            }
            return { id, login };
        } catch (error) {
            if (error instanceof Error && error.message.includes('No Secret was written.')) throw error;
            throw Object.assign(new Error('GitHub identity verification failed. Check network access and retry; no Secret was written.'), { cause: error });
        } finally {
            clearTimeout(timeout);
        }
    }
}
