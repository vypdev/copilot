import { SetupCredentialValidationAdapter } from '../setup_credential_validation_adapter';

function response(body: unknown, ok = true, status = 200): Response {
    return { ok, status, json: jest.fn().mockResolvedValue(body) } as unknown as Response;
}

describe('SetupCredentialValidationAdapter', () => {
    it.each([
        ['ANTHROPIC_API_KEY', 'anthropic', 'x-api-key', 'fixture-key'],
        ['CURSOR_API_KEY', 'cursor', 'Authorization', `Basic ${Buffer.from('fixture-key:').toString('base64')}`],
        ['OPENCODE_API_KEY', 'opencode', 'Authorization', 'Bearer fixture-key'],
    ])('uses the provider-specific credential boundary for %s', async (name, provider, header, expected) => {
        const fetcher = jest.fn().mockResolvedValue(response({}));
        const result = await new SetupCredentialValidationAdapter({ fetcher }).validateCredential({
            name, provider, kind: 'apiKey', description: 'fixture', model: 'fixture-model',
        }, 'fixture-key');
        expect(result.status).toBe('valid');
        expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
            redirect: 'error', headers: expect.objectContaining({ [header]: expected,
                ...(provider === 'anthropic' ? { 'anthropic-version': '2023-06-01' } : {}) }),
        }));
    });

    it('ignores malformed model entries while matching a Google resource suffix', async () => {
        const fetcher = jest.fn().mockResolvedValue(response({ models: [null, {}, { name: 'publishers/google/models/fixture' }] }));
        expect((await new SetupCredentialValidationAdapter({ fetcher }).validateCredential({
            name: 'GOOGLE_API_KEY', provider: 'google', model: 'fixture', kind: 'apiKey', description: 'fixture',
        }, 'fixture-key')).status).toBe('valid');
    });

    it('treats an explicitly hidden repository as invalid without exposing provider data', async () => {
        const fetcher = jest.fn().mockResolvedValueOnce(response({ id: 1, login: 'operator' }))
            .mockResolvedValueOnce(response({ private: 'fixture-token' }, false, 404));
        expect(await new SetupCredentialValidationAdapter({ fetcher }).validateSetupPat('owner', 'repo', 'fixture-token'))
            .toMatchObject({ status: 'invalid', message: 'Provider rejected the credential (HTTP 404).' });
    });

    it('maps an aborted transport to a bounded timeout message', async () => {
        const fetcher = jest.fn().mockRejectedValue(new DOMException('fixture-token', 'AbortError'));
        expect(await new SetupCredentialValidationAdapter({ fetcher }).validateSetupPat('owner', 'repo', 'fixture-token'))
            .toMatchObject({ status: 'unverifiable', message: 'Validation timed out.' });
    });

    it('validates setup identity and repository access without logging the token', async () => {
        const fetcher = jest.fn()
            .mockResolvedValueOnce(response({ id: 1, login: 'operator' }))
            .mockResolvedValueOnce(response({ id: 2, full_name: 'owner/repo' }));
        const check = await new SetupCredentialValidationAdapter({ fetcher }).validateSetupPat('owner', 'repo', 'secret-token');

        expect(check).toMatchObject({ name: 'SETUP_PAT', status: 'valid', account: 'operator' });
        expect(fetcher).toHaveBeenNthCalledWith(1, 'https://api.github.com/user', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }) }));
        expect(check.message).not.toContain('secret-token');
    });

    it('classifies provider authentication failures as invalid', async () => {
        const fetcher = jest.fn().mockResolvedValue(response({}, false, 401));
        const check = await new SetupCredentialValidationAdapter({ fetcher }).validateCredential({
            name: 'OPENAI_API_KEY', kind: 'apiKey', description: 'OpenAI', provider: 'openai', model: 'gpt-5.6-luna',
        }, 'secret-key');

        expect(check).toEqual({ name: 'OPENAI_API_KEY', status: 'invalid', message: 'Provider rejected the credential (HTTP 401).' });
    });

    it('validates provider metadata with the provider-specific auth scheme', async () => {
        const fetcher = jest.fn().mockResolvedValue(response({ data: [{ id: 'gpt-5.6-luna' }] }));
        const check = await new SetupCredentialValidationAdapter({ fetcher }).validateCredential({
            name: 'OPENAI_API_KEY', kind: 'apiKey', description: 'OpenAI', provider: 'openai', model: 'gpt-5.6-luna',
        }, 'secret-key');

        expect(check.status).toBe('valid');
        expect(fetcher).toHaveBeenCalledWith('https://api.openai.com/v1/models', expect.objectContaining({
            headers: expect.objectContaining({ Authorization: 'Bearer secret-key' }),
        }));
    });

    it('reports provider keys without a safe endpoint as unverifiable', async () => {
        const check = await new SetupCredentialValidationAdapter({ fetcher: jest.fn() }).validateCredential({
            name: 'CUSTOM_API_KEY', kind: 'apiKey', description: 'Custom provider', provider: 'custom',
        }, 'secret-key');
        expect(check.status).toBe('unverifiable');
    });

    it('classifies transient provider failures as unverifiable', async () => {
        const fetcher = jest.fn().mockResolvedValue(response({}, false, 503));
        const check = await new SetupCredentialValidationAdapter({ fetcher }).validateCredential({
            name: 'OPENAI_API_KEY', kind: 'apiKey', description: 'OpenAI', provider: 'openai',
        }, 'secret-key');
        expect(check.status).toBe('unverifiable');
    });

    it('checks Google keys through the query parameter and accepts model names with the resource prefix', async () => {
        const fetcher = jest.fn().mockResolvedValue(response({ models: [{ name: 'models/gemini-2.5-pro' }] }));
        const check = await new SetupCredentialValidationAdapter({ fetcher }).validateCredential({
            name: 'GOOGLE_API_KEY', kind: 'apiKey', description: 'Google', provider: 'google', model: 'gemini-2.5-pro',
        }, 'secret-key');
        expect(check.status).toBe('valid');
        expect(fetcher.mock.calls[0][0]).toContain('key=secret-key');
    });

    it('rejects a valid key when the selected model is not available', async () => {
        const fetcher = jest.fn().mockResolvedValue(response({ data: [{ id: 'other-model' }] }));
        const check = await new SetupCredentialValidationAdapter({ fetcher }).validateCredential({
            name: 'OPENROUTER_API_KEY', kind: 'apiKey', description: 'OpenRouter', provider: 'openrouter', model: 'requested-model',
        }, 'secret-key');
        expect(check.status).toBe('invalid');
        expect(check.message).toContain('not available');
    });
});
