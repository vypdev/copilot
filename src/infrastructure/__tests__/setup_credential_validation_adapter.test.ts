import { SetupCredentialValidationAdapter } from '../setup_credential_validation_adapter';

function response(body: unknown, ok = true, status = 200): Response {
    return { ok, status, json: jest.fn().mockResolvedValue(body) } as unknown as Response;
}

describe('SetupCredentialValidationAdapter', () => {
    it('validates setup identity and repository access without logging the token', async () => {
        const fetcher = jest.fn()
            .mockResolvedValueOnce(response({ login: 'operator' }))
            .mockResolvedValueOnce(response({ full_name: 'repo' }));
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
