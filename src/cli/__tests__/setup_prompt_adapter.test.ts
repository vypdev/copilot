import { SetupPromptAdapter } from '../setup_prompt_adapter';
import { buildSetupPlan, createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_policy';

describe('SetupPromptAdapter non-interactive boundary', () => {
    it('returns defaults and accepts explicit non-interactive decisions without reading secrets', async () => {
        const adapter = new SetupPromptAdapter({ interactive: false, assumeYes: false, credentialValues: { PAT: 'workflow-token' } });
        const configuration = createDefaultSetupConfiguration();
        await expect(adapter.collect(configuration)).resolves.toBe(configuration);
        const plan = buildSetupPlan(configuration);
        adapter.showPlan(plan);
        await expect(adapter.confirm(plan)).resolves.toBe(true);
        await expect(adapter.requestSetupPat()).resolves.toBeUndefined();
        await expect(adapter.requestWorkflowPat(plan.credentialRequirements[0])).resolves.toEqual({ name: 'PAT', value: 'workflow-token' });
        await expect(adapter.requestApiKey(plan.credentialRequirements[1])).resolves.toBeUndefined();
        await expect(adapter.chooseExistingCredential(plan.credentialRequirements[0], {
            name: 'PAT', status: 'unverifiable', message: 'unknown',
        })).resolves.toBe('replace');
        await expect(adapter.confirmWorkflowUpdates([
            { file: 'workflow.yml', destination: '.github/workflows/workflow.yml', status: 'changed' },
        ], false)).resolves.toBe(false);
        await expect(adapter.confirmWorkflowUpdates([
            { file: 'workflow.yml', destination: '.github/workflows/workflow.yml', status: 'changed' },
        ], true)).resolves.toBe(true);
        adapter.showCredentialChecks([{ name: 'PAT', status: 'valid', message: 'ok' }]);
        adapter.showDoctorChecks([{ area: 'PAT', status: 'pass', message: 'ok' }]);
        adapter.close();
    });
});
