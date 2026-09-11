import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSetupConfigurationOverrides } from '../setup_config_file';

describe('setup configuration file loader', () => {
    let directory: string;

    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'copilot-setup-config-'));
    });

    afterEach(() => {
        rmSync(directory, { recursive: true, force: true });
    });

    it('loads a typed YAML override object', () => {
        const file = join(directory, 'setup.yml');
        writeFileSync(file, [
            'features:',
            '  release: false',
            '  credentialHealth: true',
            'agents:',
            '  reviewer:',
            '    provider: opencode',
            '    modelProvider: anthropic',
            '    model: claude-3-7-sonnet',
            'repository:',
            '  mainBranch: feature/token-refresh',
            '  desiredReviewersCount: 2',
            'ai:',
            '  bugbotFailOnUnresolved: true',
            'actionInputs:',
            '  debug: "true"',
        ].join('\n'));

        expect(loadSetupConfigurationOverrides(file)).toEqual({
            features: { release: false, credentialHealth: true },
            agents: {
                reviewer: {
                    provider: 'opencode',
                    modelProvider: 'anthropic',
                    model: 'claude-3-7-sonnet',
                },
            },
            repository: { mainBranch: 'feature/token-refresh', desiredReviewersCount: 2 },
            ai: { bugbotFailOnUnresolved: true },
            actionInputs: { debug: 'true' },
        });
    });

    it('accepts non-secret credential management switches in the override file', () => {
        const file = join(directory, 'setup.yml');
        writeFileSync(file, 'manageRepositorySecrets: true\nfeatures:\n  credentialHealth: true\n');

        expect(loadSetupConfigurationOverrides(file)).toEqual({
            manageRepositorySecrets: true,
            features: { credentialHealth: true },
        });
    });

    it('accepts JSON because JSON is a YAML-compatible document', () => {
        const file = join(directory, 'setup.json');
        writeFileSync(file, JSON.stringify({ createInitialTag: false }));

        expect(loadSetupConfigurationOverrides(file)).toEqual({ createInitialTag: false });
    });

    it('accepts independent organization storage policies without credential values', () => {
        const file = join(directory, 'scoped-setup.yml');
        writeFileSync(file, [
            'storage:',
            '  secrets:',
            '    defaultScope: organization',
            '    organizationVisibility: selected',
            '    preserveExisting: true',
            '  variables:',
            '    defaultScope: repository',
            '    overrides:',
            '      OPENAI_API_KEY: organization',
        ].join('\n'));

        expect(loadSetupConfigurationOverrides(file)).toEqual({
            storage: {
                secrets: { defaultScope: 'organization', organizationVisibility: 'selected', preserveExisting: true },
                variables: { defaultScope: 'repository', overrides: { OPENAI_API_KEY: 'organization' } },
            },
        });
    });

    it('loads structured merge-queue attestations without string coercion', () => {
        const file = join(directory, 'merge-queue.yml');
        writeFileSync(file, [
            'repository:',
            '  reconciliationPullRequestMode: merge-queue',
            '  mergeQueueCheckAttestations:',
            '    - context: Vendor security gate',
            '      integrationId: 424242',
            '      targets: [production, development]',
        ].join('\n'));

        expect(loadSetupConfigurationOverrides(file)).toEqual({
            repository: {
                reconciliationPullRequestMode: 'merge-queue',
                mergeQueueCheckAttestations: [{
                    context: 'Vendor security gate',
                    integrationId: 424242,
                    targets: ['production', 'development'],
                }],
            },
        });
    });

    it.each([
        ['a secret-like value', '{"actionInputs":{"token":"secret"}}', /must not contain secrets/],
        ['an unknown field', '{"reposotory":{"mainBranch":"main"}}', /Unknown setup configuration field/],
        ['a wrong nested type', '{"repository":{"desiredReviewersCount":"2"}}', /repository\.desiredReviewersCount must be a non-negative integer/],
        ['an unknown feature', '{"features":{"pulls":true}}', /Unknown features field/],
        ['an invalid merge-queue attestation', '{"repository":{"mergeQueueCheckAttestations":[{"context":"CI","integrationId":1,"targets":["all"]}]}}', /targets must contain/],
    ])('rejects %s', (_name, content, error) => {
        const file = join(directory, 'invalid.yml');
        writeFileSync(file, content);

        expect(() => loadSetupConfigurationOverrides(file)).toThrow(error);
    });
});
