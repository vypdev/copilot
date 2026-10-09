import { SetupGithubIdentityQueryAdapter } from '../setup_github_identity_query_adapter';

describe('SetupGithubIdentityQueryAdapter', () => {
    it('uses the operator token to resolve expected identity and the workflow PAT to identify its owner', async () => {
        const fetcher = jest.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 42, login: 'vypbot' }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 42, login: 'vypbot' }) });
        const adapter = new SetupGithubIdentityQueryAdapter(fetcher as unknown as typeof fetch);
        await expect(adapter.resolve('vypbot', 'setup-token')).resolves.toEqual({ id: 42, login: 'vypbot' });
        await expect(adapter.identify('workflow-token')).resolves.toEqual({ id: 42, login: 'vypbot' });
        expect(fetcher.mock.calls[0][0]).toBe('https://api.github.com/users/vypbot');
        expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer setup-token');
        expect(fetcher.mock.calls[1][0]).toBe('https://api.github.com/user');
        expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer workflow-token');
    });

    it('rejects malformed logins before a request', async () => {
        const fetcher = jest.fn();
        const adapter = new SetupGithubIdentityQueryAdapter(fetcher as unknown as typeof fetch);
        await expect(adapter.resolve('bad/login', 'setup-token')).rejects.toThrow('valid GitHub');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('resolves and identifies a single-character login, including canonical casing', async () => {
        const identity = { id: 42, login: 'A' };
        const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => identity });
        const adapter = new SetupGithubIdentityQueryAdapter(fetcher as unknown as typeof fetch);
        await expect(adapter.resolve('a', 'setup-token')).resolves.toEqual(identity);
        await expect(adapter.identify('workflow-token')).resolves.toEqual(identity);
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(fetcher.mock.calls[0][0]).toBe('https://api.github.com/users/a');
        expect(fetcher.mock.calls[1][0]).toBe('https://api.github.com/user');
    });

    it('rejects a valid identity for a different requested bot and accepts casing differences', async () => {
        const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 42, login: 'vypbot' }) });
        const adapter = new SetupGithubIdentityQueryAdapter(fetcher as unknown as typeof fetch);
        await expect(adapter.resolve('other-bot', 'setup-token')).rejects.toThrow('different bot');
        await expect(adapter.resolve('Vypbot', 'setup-token')).resolves.toEqual({ id: 42, login: 'vypbot' });
    });

    it('rejects an unverified or malformed response without returning provider text', async () => {
        const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: '42', login: 'vypbot' }) });
        await expect(new SetupGithubIdentityQueryAdapter(fetcher as unknown as typeof fetch)
            .identify('workflow-token')).rejects.toThrow('invalid identity');
    });

    it.each([
        { ok: false, json: async () => ({ message: 'sensitive provider text' }) },
        { ok: true, json: async () => null },
        { ok: true, json: async () => [] },
    ])('rejects non-success and non-object identities without leaking provider content', async response => {
        const fetcher = jest.fn().mockResolvedValue(response);
        await expect(new SetupGithubIdentityQueryAdapter(fetcher as unknown as typeof fetch)
            .identify('workflow-token')).rejects.toThrow('No Secret was written');
    });

    it.each(['sensitive provider text', 'sensitive provider text. No Secret was written.'])(
        'drops raw network failures at the credential boundary: %s', async message => {
        const failure = new Error(message);
        const fetcher = jest.fn().mockRejectedValue(failure);
        const error = await new SetupGithubIdentityQueryAdapter(fetcher as unknown as typeof fetch)
            .identify('workflow-token').catch(error => error as Error);
        expect((error as Error).message).toContain('network access');
        expect(error).not.toHaveProperty('cause');
        expect(String(error)).not.toContain('sensitive provider text');
    });
});
