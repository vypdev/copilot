import type { Execution } from '../../../../data/model/execution';
import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_policy';
import { createInitialSetupRequest } from '../initial_setup_request';

describe('createInitialSetupRequest', () => {
    it('maps only setup facts from the legacy execution aggregate', () => {
        const setupConfiguration = createDefaultSetupConfiguration();
        const execution = {
            owner: 'owner',
            repo: 'repo',
            tokens: { token: 'token' },
            labels: { configured: true },
            issueTypes: { bug: true },
            inputs: {
                setupConfiguration,
                setupCredentials: { workflowPat: { name: 'PAT', value: 'secret' }, apiKeys: [] },
                setupRemoteConfiguration: { ownerType: 'Organization' },
                setupWorkflowUpdates: ['a.yml', 42, 'b.yml'],
                unrelatedExecutionState: { shouldNotBeCopied: true },
            },
        } as unknown as Execution;

        expect(createInitialSetupRequest(execution)).toEqual({
            owner: 'owner',
            repo: 'repo',
            token: 'token',
            labels: execution.labels,
            issueTypes: execution.issueTypes,
            setupConfiguration,
            setupCredentials: execution.inputs?.setupCredentials,
            setupRemoteConfiguration: execution.inputs?.setupRemoteConfiguration,
            workflowUpdates: ['a.yml', 'b.yml'],
        });
    });

    it('uses safe empty setup input defaults', () => {
        const execution = {
            owner: 'owner',
            repo: 'repo',
            tokens: { token: 'token' },
            labels: {},
            issueTypes: {},
            inputs: { setupWorkflowUpdates: 'not-an-array' },
        } as unknown as Execution;

        expect(createInitialSetupRequest(execution)).toMatchObject({
            setupConfiguration: undefined,
            setupCredentials: undefined,
            setupRemoteConfiguration: undefined,
            workflowUpdates: [],
        });
    });
});
