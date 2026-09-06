import { SetupRemoteCredentialHealthAdapter } from '../setup_remote_credential_health_adapter';

const requirements = [{ name: 'PAT', kind: 'workflowPat' as const, description: 'workflow PAT' }, { name: 'OPENAI_API_KEY', kind: 'apiKey' as const, description: 'OpenAI' }];

function client(overrides: Record<string, unknown> = {}) {
    return {
        rest: {
            actions: {
                getWorkflow: jest.fn().mockResolvedValue({}),
                createWorkflowDispatch: jest.fn().mockResolvedValue(undefined),
                listWorkflowRuns: jest.fn().mockResolvedValue({ data: { workflow_runs: [{ id: 1, status: 'completed', conclusion: 'success', created_at: new Date().toISOString() }] } }),
                getWorkflowRun: jest.fn(),
                listJobsForWorkflowRun: jest.fn().mockResolvedValue({ data: { jobs: [
                    { name: 'Verify PAT', status: 'completed', conclusion: 'success' },
                    { name: 'Verify OPENAI_API_KEY', status: 'completed', conclusion: 'success' },
                ] } }),
                ...overrides,
            },
        },
        repos: {
            get: jest.fn(), getContent: jest.fn(), createOrUpdateFileContents: jest.fn(), deleteFile: jest.fn(),
        },
    };
}

describe('SetupRemoteCredentialHealthAdapter', () => {
    it('dispatches the health workflow and maps a successful run to valid checks', async () => {
        const github = client();
        const adapter = new SetupRemoteCredentialHealthAdapter({ getClient: jest.fn(() => github) }, { waitMs: 0, pollMs: 0 });
        const checks = await adapter.validateExisting('owner', 'repo', 'token', 'main', requirements);

        expect(checks).toEqual([
            { name: 'PAT', status: 'valid', message: 'Remote credential health check passed.' },
            { name: 'OPENAI_API_KEY', status: 'valid', message: 'Remote credential health check passed.' },
        ]);
        expect(github.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith(expect.objectContaining({
            workflow_id: 'copilot_credential_health.yml', ref: 'main', inputs: { check_pat: 'true', check_openai: 'true' },
        }));
    });

    it('returns undefined when the health workflow has not been installed', async () => {
        const error = Object.assign(new Error('not found'), { status: 404 });
        const github = client({ getWorkflow: jest.fn().mockRejectedValue(error) });
        const checks = await new SetupRemoteCredentialHealthAdapter({ getClient: jest.fn(() => github) }).validateExisting('owner', 'repo', 'token', 'main', requirements);
        expect(checks).toBeUndefined();
        expect(github.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled();
    });

    it('maps each credential from its own remote job result', async () => {
        const github = client({
            listWorkflowRuns: jest.fn().mockResolvedValue({ data: { workflow_runs: [{ id: 2, status: 'completed', conclusion: 'failure' }] } }),
            listJobsForWorkflowRun: jest.fn().mockResolvedValue({ data: { jobs: [
                { name: 'Verify PAT', status: 'completed', conclusion: 'success' },
                { name: 'Verify OPENAI_API_KEY', status: 'completed', conclusion: 'failure' },
            ] } }),
        });
        const checks = await new SetupRemoteCredentialHealthAdapter({ getClient: jest.fn(() => github) }, { waitMs: 0 }).validateExisting('owner', 'repo', 'token', 'main', requirements);
        expect(checks).toEqual([
            { name: 'PAT', status: 'valid', message: 'Remote credential health check passed.' },
            { name: 'OPENAI_API_KEY', status: 'invalid', message: 'Remote credential health check failed (failure).' },
        ]);
    });

    it('polls a queued run until it completes', async () => {
        const github = client({
            listWorkflowRuns: jest.fn().mockResolvedValue({ data: { workflow_runs: [{ id: 3, status: 'in_progress', conclusion: null }] } }),
            getWorkflowRun: jest.fn().mockResolvedValue({ data: { id: 3, status: 'completed', conclusion: 'success' } }),
        });
        const sleep = jest.fn().mockResolvedValue(undefined);
        const checks = await new SetupRemoteCredentialHealthAdapter({ getClient: jest.fn(() => github) }, { waitMs: 100, pollMs: 0, sleep }).validateExisting('owner', 'repo', 'token', 'main', requirements);
        expect(checks?.[0].status).toBe('valid');
        expect(sleep).toHaveBeenCalled();
    });

    it('reports an unverifiable result when GitHub does not return a run', async () => {
        const github = client({ listWorkflowRuns: jest.fn().mockResolvedValue({ data: { workflow_runs: [] } }) });
        const checks = await new SetupRemoteCredentialHealthAdapter({ getClient: jest.fn(() => github) }, { waitMs: 0, pollMs: 0 }).validateExisting('owner', 'repo', 'token', 'main', requirements);
        expect(checks?.every(check => check.status === 'unverifiable')).toBe(true);
    });

    it('does not claim an unsupported credential passed just because the workflow passed', async () => {
        const github = client({
            listJobsForWorkflowRun: jest.fn().mockResolvedValue({ data: { jobs: [] } }),
        });
        const checks = await new SetupRemoteCredentialHealthAdapter({ getClient: jest.fn(() => github) }, { waitMs: 0 }).validateExisting(
            'owner', 'repo', 'token', 'main', [...requirements, { name: 'MISTRAL_API_KEY', kind: 'apiKey' as const, description: 'Mistral' }],
        );
        expect(checks?.find(check => check.name === 'MISTRAL_API_KEY')).toEqual({
            name: 'MISTRAL_API_KEY', status: 'unverifiable', message: 'No remote health check is implemented for this provider.',
        });
    });

    it('temporarily installs and removes the health workflow when setup explicitly enables bootstrap', async () => {
        const error = Object.assign(new Error('not found'), { status: 404 });
        const github = client({ getWorkflow: jest.fn().mockRejectedValue(error) });
        github.repos.getContent.mockResolvedValue({ data: { sha: 'temporary-sha' } });
        const checks = await new SetupRemoteCredentialHealthAdapter({ getClient: jest.fn(() => github) }, {
            bootstrapWhenMissing: true, workflowContent: 'name: health', waitMs: 0, pollMs: 0,
        }).validateExisting('owner', 'repo', 'token', 'main', requirements);
        expect(checks?.every(check => check.status === 'valid')).toBe(true);
        expect(github.repos.createOrUpdateFileContents).toHaveBeenCalledWith(expect.objectContaining({ branch: 'main' }));
        expect(github.repos.deleteFile).toHaveBeenCalledWith(expect.objectContaining({ sha: 'temporary-sha', branch: 'main' }));
    });
});
