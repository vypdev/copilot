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

    it('wraps network failures while preserving the cause privately', async () => {
        const failure = new Error('sensitive provider text');
        const fetcher = jest.fn().mockRejectedValue(failure);
        await expect(new SetupGithubIdentityQueryAdapter(fetcher as unknown as typeof fetch)
            .identify('workflow-token')).rejects.toMatchObject({
                message: expect.stringContaining('network access'), cause: failure,
            });
    });
});
