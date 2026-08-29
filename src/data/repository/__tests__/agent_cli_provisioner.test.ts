import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentCliProvisioner } from '../agent_cli_provisioner';

describe('AgentCliProvisioner', () => {
    it('accepts a preinstalled Codex CLI without a version or credential', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-cli-test-'));
        const executable = join(directory, 'codex');
        try {
            writeFileSync(executable, '#!/bin/sh\nexit 0\n');
            chmodSync(executable, 0o755);
            expect(() => new AgentCliProvisioner().provision({
                provider: 'codex',
                command: 'codex exec --model gpt-5 --config model_provider=openai -',
            }, { PATH: directory })).not.toThrow();
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('fails clearly when provisioning is disabled and the CLI is absent', () => {
        expect(() => new AgentCliProvisioner().provision('cursor', {
            PATH: '',
            AGENT_PROVISIONING: 'disabled',
        })).toThrow('provisioning is disabled');
    });

    it('rejects unknown provisioning modes before touching the runner', () => {
        expect(() => new AgentCliProvisioner().provision('codex', {
            PATH: '',
            AGENT_PROVISIONING: 'sometimes',
        })).toThrow('AGENT_PROVISIONING must be one of');
    });

    it('does not install the same executable twice for findings and fixer', () => {
        const provisioner = new AgentCliProvisioner();
        const internals = provisioner as unknown as {
            installPnpmPackage: () => void;
            assertInstalled: () => void;
        };
        const install = jest.spyOn(internals, 'installPnpmPackage').mockImplementation(() => undefined);
        jest.spyOn(internals, 'assertInstalled').mockImplementation(() => undefined);
        const environment = { PATH: '', AGENT_PROVISIONING: 'auto', CODEX_VERSION: '1.0.0' };

        provisioner.provision({ provider: 'codex', command: 'codex exec --model one --config model_provider=openai -' }, environment);
        provisioner.provision({ provider: 'codex', command: 'codex exec --model two --config model_provider=openai -' }, environment);

        expect(install).toHaveBeenCalledTimes(1);
    });
});
