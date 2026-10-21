import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { createDefaultSetupConfiguration, mergeSetupConfiguration, buildSetupActionInputs, buildSetupRepositoryVariables, validateSetupConfiguration } from '../../application/policies/setup_configuration_policy';
import { loadSetupConfigurationOverrides } from '../../cli/setup_config_file';
import { SETUP_ORGANIZATION_VARIABLE_BINDINGS } from '../../application/policies/setup_organization_variable_bindings';
import { copySetupFiles, ensureGitHubDirs } from '../../utils/setup_files';
import { parseIssueWorkflowBoolean } from '../../actions/input_boolean_policy';

jest.mock('../../utils/logger', () => ({ logInfo: jest.fn() }));
describe('verification setup installation contract', () => {
    let root: string;
    beforeEach(() => { root = fs.mkdtempSync(path.join(tmpdir(), 'copilot-setup-config-')); });
    afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
    it('defaults off and accepts legacy configuration without the additive property', () => {
        const config = createDefaultSetupConfiguration();
        expect(config.repository.verificationSetup).toBe(false);
        delete config.repository.verificationSetup;
        expect(validateSetupConfiguration(config)).not.toContain('verification-setup must be a boolean value.');
        expect(buildSetupActionInputs(config)['verification-setup']).toBe('false');
        expect(buildSetupRepositoryVariables(config)).toContainEqual({ name: 'VERIFICATION_SETUP', value: 'false' });
    });
    it('loads and plans the explicit opt-in consistently', () => {
        const file = path.join(root, 'setup.yml'); fs.writeFileSync(file, 'repository:\n  verificationSetup: true\n');
        const config = mergeSetupConfiguration(createDefaultSetupConfiguration(), loadSetupConfigurationOverrides(file));
        expect(buildSetupActionInputs(config)['verification-setup']).toBe('true');
        expect(buildSetupRepositoryVariables(config)).toContainEqual({ name: 'VERIFICATION_SETUP', value: 'true' });
        expect(SETUP_ORGANIZATION_VARIABLE_BINDINGS).toContainEqual({ variable: 'VERIFICATION_SETUP', path: 'repository.verificationSetup' });
    });
    it.each(['true', '/arbitrary/helper', 1])('rejects nonboolean opt-in %j in config files and plans', value => {
        const file = path.join(root, 'setup.json'); fs.writeFileSync(file, JSON.stringify({ repository: { verificationSetup: value } }));
        expect(() => loadSetupConfigurationOverrides(file)).toThrow('repository.verificationSetup must be a boolean');
        const config = createDefaultSetupConfiguration(); Object.assign(config.repository, { verificationSetup: value });
        expect(validateSetupConfiguration(config)).toContain('verification-setup must be a boolean value.');
    });
    it.each(['yes', 'script.mjs'])('rejects arbitrary Action opt-in %s', value => {
        expect(() => parseIssueWorkflowBoolean(value, 'verification-setup', false)).toThrow('verification-setup must be true or false');
    });
    it.each(['copilot_issue.yml', 'copilot_issue_comment.yml', 'copilot_pull_request.yml', 'copilot_pull_request_comment.yml', 'copilot_pull_request_review_state.yml', 'copilot_commit.yml'])(
        'keeps source and distributed %s opt-in explicit and disabled by default', name => {
            for (const directory of ['.github/workflows', 'setup/workflows']) {
                const workflow = yaml.load(fs.readFileSync(path.resolve(__dirname, '../../..', directory, name), 'utf8')) as {jobs: Record<string, {steps: {uses?: string; with?: Record<string, unknown>}[]}>};
                const actions = Object.values(workflow.jobs).flatMap(job => job.steps).filter(step => step.uses === './' || step.uses?.startsWith('vypdev/copilot@'));
                expect(actions.length).toBeGreaterThan(0);
                for (const action of actions) expect(action.with?.['verification-setup']).toBe("${{ vars.VERIFICATION_SETUP || 'false' }}");
            }
        },
    );
    it('preserves the consumer helper through install and repeated workflow updates', () => {
        const helper = path.join(root, '.github/actions/copilot-verification-setup/action.yml'); fs.mkdirSync(path.dirname(helper), { recursive: true });
        const bytes = 'export const repositoryOwned = true;\n'; fs.writeFileSync(helper, bytes);
        const config = createDefaultSetupConfiguration(); config.repository.verificationSetup = true;
        const source = path.resolve(__dirname, '../../../setup');
        ensureGitHubDirs(root); copySetupFiles(root, source, config.features, { setupConfiguration: config });
        const approved = fs.readdirSync(path.join(root, '.github/workflows'));
        for (let count = 0; count < 2; count++) {
            copySetupFiles(root, source, config.features, { setupConfiguration: config, updateExistingWorkflows: true, approvedWorkflowFiles: approved });
            expect(fs.readFileSync(helper, 'utf8')).toBe(bytes);
        }
        const manifest = fs.readFileSync(path.join(root, '.copilot/setup-manifest.json'), 'utf8');
        expect(manifest).not.toContain('copilot-verification-setup/action.yml');
    });
});
