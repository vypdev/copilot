import type { SetupGithubIdentity, SetupGithubIdentityQueryPort } from '../application/ports/setup_pat_identity_ports';
import { withHttpDeadline } from './http_deadline';

const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
class IdentityValidationFailure extends Error {}

export class SetupGithubIdentityQueryAdapter implements SetupGithubIdentityQueryPort {
    constructor(private readonly fetcher: typeof fetch = fetch, private readonly timeoutMs = 10_000) {}

    async resolve(login: string, setupToken: string): Promise<SetupGithubIdentity> {
        if (!LOGIN_PATTERN.test(login)) throw new Error('Enter a valid GitHub bot account login.');
        const identity = await this.request(`https://api.github.com/users/${encodeURIComponent(login)}`, setupToken);
        if (identity.login.toLowerCase() !== login.toLowerCase()) {
            throw new Error('GitHub returned a different bot account. No Secret was written.');
        }
        return identity;
    }

    identify(token: string): Promise<SetupGithubIdentity> {
        return this.request('https://api.github.com/user', token);
    }

    private async request(url: string, token: string): Promise<SetupGithubIdentity> {
        try {
            return await withHttpDeadline(this.timeoutMs, async signal => {
                const response = await this.fetcher(url, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28',
                    },
                    signal,
                    redirect: 'error',
                });
                if (!response.ok) throw new IdentityValidationFailure('GitHub could not verify the selected bot account or token identity. No Secret was written.');
                const body: unknown = await response.json();
                signal.throwIfAborted();
                if (!body || typeof body !== 'object' || Array.isArray(body)) throw new IdentityValidationFailure('GitHub returned an invalid identity. No Secret was written.');
                const { id, login } = body as Record<string, unknown>;
                if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || typeof login !== 'string' || !LOGIN_PATTERN.test(login)) {
                    throw new IdentityValidationFailure('GitHub returned an invalid identity. No Secret was written.');
                }
                return { id, login };
            });
        } catch (error) {
            if (error instanceof IdentityValidationFailure) throw error;
            // Raw transport causes can contain credentials; this boundary intentionally discards them.
            // eslint-disable-next-line preserve-caught-error
            throw new Error('GitHub identity verification failed. Check network access and retry; no Secret was written.');
        }
    }
}
