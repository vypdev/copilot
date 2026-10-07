import { runLocalAction } from '../local_action';
import { INPUT_KEYS } from '../../application/contracts/input_keys';
import { buildSetupParams } from '../../cli/commands/setup_policy';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_policy';
import { SetupExecutionUseCase } from '../../application/usecases/execution/setup_execution_use_case';
import { InitialSetupUseCase } from '../../application/usecases/actions/initial_setup_use_case';
import { SingleActionUseCase } from '../../application/usecases/single_action_use_case';
import type { SetupRemoteConfiguration } from '../../domain/setup';
import { setupResultEffects } from '../../cli/setup_result_receipt';

jest.mock('chalk', () => ({ cyan: (value: string) => value, gray: (value: string) => value, red: (value: string) => value }));
jest.mock('boxen', () => jest.fn((value: string) => value));
jest.mock('../../utils/logger', () => ({
    logInfo: jest.fn(), logWarn: jest.fn(), logError: jest.fn(), logDebugInfo: jest.fn(),
    setGlobalLoggerDebug: jest.fn(), setStructuredLogging: jest.fn(),
    logDebugWarning: jest.fn(), logDebugError: jest.fn(), logWarning: jest.fn(),
    clearAccumulatedLogs: jest.fn(), getAccumulatedLogsAsText: jest.fn(() => ''),
    getAccumulatedLogEntries: jest.fn(() => []),
}));

const mockLocalComposition = jest.fn();
const mockExecutionComposition = jest.fn();
const mockRouteComposition = jest.fn();
jest.mock('../../infrastructure/composition/local_action_composition_root', () => ({
    createLocalActionCompositionRoot: (...args: unknown[]) => mockLocalComposition(...args),
}));
jest.mock('../../infrastructure/composition/execution_setup_composition_root', () => ({
    createSetupExecutionUseCase: (...args: unknown[]) => mockExecutionComposition(...args),
}));
jest.mock('../../infrastructure/composition/main_run_route_composition_root', () => ({
    createMainRunRouteCompositionRoot: (...args: unknown[]) => mockRouteComposition(...args),
}));

const remote: SetupRemoteConfiguration = {
    ownerType: 'Organization', repositoryVisibility: 'private', repositoryId: 42,
    repositorySecrets: [], repositorySecretsAccess: 'available',
    organizationSecrets: [], organizationSecretsAccess: 'available', organizationWorkflowPat: 'absent',
    repositoryVariables: [], repositoryVariablesAccess: 'available',
    organizationVariables: [], organizationVariablesAccess: 'available', organizationAccess: 'available',
};

describe('local setup Apply through production execution and provisioning workflows', () => {
    const originalActions = process.env.GITHUB_ACTIONS;
    beforeEach(() => { jest.clearAllMocks(); delete process.env.GITHUB_ACTIONS; });
    afterEach(() => {
        if (originalActions === undefined) delete process.env.GITHUB_ACTIONS;
        else process.env.GITHUB_ACTIONS = originalActions;
    });

    function fixture(validToken = true) {
        const configuration = createDefaultSetupConfiguration();
        configuration.projects.ids = '';
        configuration.storage.secrets.defaultScope = 'organization';
        configuration.storage.variables.defaultScope = 'organization';
        const params = buildSetupParams({}, { owner: 'owner', repo: 'repo' }, 'setup-fixture', configuration,
            { workflowPat: { name: 'PAT', value: 'bot-fixture' }, apiKeys: [] }, [], remote);
        const forbidden = jest.fn(async () => { throw new Error('Repository installation must not inspect an issue or run an agent.'); });
        const issuePort = { isIssue: forbidden, isPullRequest: forbidden, getHeadBranch: forbidden,
            getLabels: forbidden, getDescription: forbidden };
        const getUser = jest.fn(async () => 'operator');
        const latestTag = { getLatestTag: jest.fn(async () => '1.0.0') };
        mockExecutionComposition.mockReturnValue(new SetupExecutionUseCase(issuePort,
            { getTokenUser: getUser }, { get: forbidden }, { resolve: forbidden }));
        mockLocalComposition.mockReturnValue({ projectBoard: { query: { getProjectDetail: forbidden }, command: {} },
            latestTagQuery: latestTag, catalogResolver: { resolve: forbidden } });
        const prepare = jest.fn(() => ({ copied: 2, skipped: 0 }));
        const secrets = jest.fn(async () => ({ created: 1, updated: 0, skipped: 0, errors: [] }));
        const variables = jest.fn(async () => ({ created: 3, updated: 0, skipped: 0, errors: [] }));
        mockRouteComposition.mockImplementation((_board, _surface, progress) => {
            const summary = { created: 0, existing: 3, errors: [] };
            const setup = new InitialSetupUseCase({ getUser, getUserDetails: jest.fn() },
                { ensureInitialLabels: jest.fn(async () => ({ configured: summary, progress: summary })) },
                { ensureIssueTypes: jest.fn(async () => summary) },
                latestTag, { getDefaultBranch: jest.fn(async () => 'main') },
                { createTag: forbidden, updateTag: forbidden, createOrVerifyTagAtSha: forbidden },
                { prepare, hasValidToken: () => validToken },
                { upsert: forbidden, upsertScopedVariables: variables },
                { upsertSecrets: forbidden, upsertScopedSecrets: secrets }, undefined, progress);
            const unrelatedAction = { taskId: 'UnrelatedAction', invoke: forbidden };
            const single = new SingleActionUseCase(undefined, undefined, undefined, unrelatedAction, setup,
                unrelatedAction, unrelatedAction, unrelatedAction);
            return { 'single-action': single.invoke.bind(single) };
        });
        return { params, forbidden, prepare, secrets, variables, getUser };
    }

    it.each([
        {},
        { [INPUT_KEYS.SINGLE_ACTION_ISSUE]: 1, issue: { number: 1 } },
        { eventName: 'pull_request', pull_request: { number: 7, head: { ref: 'feature/1-work' }, base: { ref: 'develop' } } },
    ])('applies an approved Codex plan with no API key and incidental work context %j', async incidental => {
        const value = fixture();
        Object.assign(value.params, incidental);
        const progress = jest.fn();
        const results = await runLocalAction(value.params, { render: false, onSetupProgress: progress });
        expect(results).toEqual([expect.objectContaining({ id: 'InitialSetupUseCase', success: true, errors: [] })]);
        expect(value.getUser).toHaveBeenCalled();
        expect(value.prepare).toHaveBeenCalledTimes(1);
        expect(value.secrets).toHaveBeenCalledTimes(1);
        expect(value.secrets.mock.calls[0]).toEqual([
            expect.objectContaining({ scope: 'organization' }), [{ name: 'PAT', value: 'bot-fixture' }],
        ]);
        expect(value.variables).toHaveBeenCalledTimes(1);
        expect(value.forbidden).not.toHaveBeenCalled();
        expect(setupResultEffects(results)).toEqual(expect.arrayContaining([
            { id: 'files', scope: 'local', state: 'completed' },
            { id: 'secrets', scope: 'organization', state: 'completed' },
            { id: 'variables', scope: 'organization', state: 'completed' },
        ]));
        expect(progress).toHaveBeenCalledWith({ id: 'secrets', scope: 'organization', state: 'completed' });
    });
    it('keeps setup authentication required before any installation or credential write', async () => {
        const value = fixture(false);
        const results = await runLocalAction(value.params, { render: false });
        expect(results[0]).toMatchObject({ success: false, errors: [expect.objectContaining({ code: 'authorization.credential-invalid' })] });
        expect(value.prepare).not.toHaveBeenCalled();
        expect(value.secrets).not.toHaveBeenCalled();
        expect(value.variables).not.toHaveBeenCalled();
    });
});
