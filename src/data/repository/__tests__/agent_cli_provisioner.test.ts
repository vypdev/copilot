import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentCliProvisioner, type AgentCliProvisioningSystem } from '../agent_cli_provisioner';

function provisioningSystem(
    executableAvailable: boolean | readonly boolean[] = false,
): AgentCliProvisioningSystem & { installPackage: jest.Mock; installCursor: jest.Mock } {
    const availability = Array.isArray(executableAvailable) ? [...executableAvailable] : [executableAvailable];
    return {
        executableExists: jest.fn(() => availability.length > 1 ? availability.shift()! : availability[0]),
        installPackage: jest.fn(),
        installCursor: jest.fn(),
    };
}

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
        const system = provisioningSystem([false, true]);
        const provisioner = new AgentCliProvisioner(system);
        const environment = { PATH: '', AGENT_PROVISIONING: 'auto', CODEX_VERSION: '1.0.0' };

        provisioner.provision({ provider: 'codex', command: 'codex exec --model one --config model_provider=openai -' }, environment);
        provisioner.provision({ provider: 'codex', command: 'codex exec --model two --config model_provider=openai -' }, environment);

        expect(system.installPackage).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['codex', 'CODEX_VERSION', '@openai/codex'],
        ['opencode', 'OPENCODE_VERSION', 'opencode-ai'],
    ] as const)('provisions a missing %s CLI from its pinned version', (provider, versionVariable, packageName) => {
        const system = provisioningSystem([false, true]);
        const provisioner = new AgentCliProvisioner(system);

        provisioner.provision(provider, { PATH: '', AGENT_PROVISIONING: 'auto', [versionVariable]: '1.2.3' });

        expect(system.installPackage).toHaveBeenCalledWith(packageName, '1.2.3');
        expect(system.installCursor).not.toHaveBeenCalled();
    });

    it('always provisions even when the selected CLI is already present', () => {
        const system = provisioningSystem(true);

        new AgentCliProvisioner(system).provision('codex', {
            PATH: '/runner/bin',
            AGENT_PROVISIONING: 'always',
            CODEX_VERSION: '1.2.3',
        });

        expect(system.installPackage).toHaveBeenCalledWith('@openai/codex', '1.2.3');
    });

    it('uses the verified Cursor installer without attempting a package install', () => {
        const system = provisioningSystem([false, true]);

        new AgentCliProvisioner(system).provision('cursor', {
            PATH: '',
            AGENT_PROVISIONING: 'auto',
            CURSOR_INSTALLER_SHA256: 'a'.repeat(64),
        });

        expect(system.installCursor).toHaveBeenCalledWith('a'.repeat(64));
        expect(system.installPackage).not.toHaveBeenCalled();
    });

    it('fails before side effects when a missing CLI has no pinned version', () => {
        const system = provisioningSystem(false);

        expect(() => new AgentCliProvisioner(system).provision('opencode', { PATH: '' })).toThrow('OPENCODE_VERSION');
        expect(system.installPackage).not.toHaveBeenCalled();
    });

    it('fails before downloading Cursor when its checksum is missing', () => {
        const system = provisioningSystem(false);

        expect(() => new AgentCliProvisioner(system).provision('cursor', { PATH: '' })).toThrow('CURSOR_INSTALLER_SHA256');
        expect(system.installCursor).not.toHaveBeenCalled();
    });
});
