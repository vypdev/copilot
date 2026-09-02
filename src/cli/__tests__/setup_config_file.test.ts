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

    it.each([
        ['a secret-like value', '{"actionInputs":{"token":"secret"}}', /must not contain secrets/],
        ['an unknown field', '{"reposotory":{"mainBranch":"main"}}', /Unknown setup configuration field/],
        ['a wrong nested type', '{"repository":{"mergeTimeout":"600"}}', /repository\.mergeTimeout must be a non-negative integer/],
        ['an unknown feature', '{"features":{"pulls":true}}', /Unknown features field/],
    ])('rejects %s', (_name, content, error) => {
        const file = join(directory, 'invalid.yml');
        writeFileSync(file, content);

        expect(() => loadSetupConfigurationOverrides(file)).toThrow(error);
    });
});
