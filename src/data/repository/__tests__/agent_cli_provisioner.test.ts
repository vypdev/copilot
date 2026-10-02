import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentProvider } from '../../../domain/agent';
import { AgentCliProvisioner, agentExecutableExists, type AgentCliProvisioningSystem } from '../agent_cli_provisioner';

function fakeInstallation(provider: AgentProvider) {
    const root = mkdtempSync(join(tmpdir(), 'copilot-official-agent-'));
    const directory = join(root, 'bin');
    mkdirSync(directory);
    const command = provider === 'cursor' ? 'agent' : provider;
    const executable = join(directory, process.platform === 'win32' ? `${command}.exe` : command);
    writeFileSync(executable, '#!/bin/sh\nexit 0\n');
    chmodSync(executable, 0o755);
    return { root, directory, executable: realpathSync(executable) };
}

function system(installation: ReturnType<typeof fakeInstallation>, version = 'provider-cli future-version') {
    return {
        executableExists: jest.fn(agentExecutableExists),
        readVersion: jest.fn(() => version),
        installOfficial: jest.fn(() => installation),
    } satisfies AgentCliProvisioningSystem;
}

describe('AgentCliProvisioner', () => {
    it('uses the default system for an existing CLI and accepts a blank executable override', () => {
        const installation = fakeInstallation('codex');
        try {
            const environment = { PATH: installation.directory };
            new AgentCliProvisioner().provision({ provider: 'codex', executable: ' ' }, environment);
            expect(environment.PATH).toBe(installation.directory);
        } finally {
            rmSync(installation.root, { recursive: true, force: true });
        }
    });

    it('uses an available operator CLI without installing or requiring an exact version', () => {
        const installation = fakeInstallation('codex');
        const adapter = system(installation);
        try {
            new AgentCliProvisioner(adapter).provision('codex', { PATH: installation.directory });
            expect(adapter.installOfficial).not.toHaveBeenCalled();
        } finally {
            rmSync(installation.root, { recursive: true, force: true });
        }
    });

    it('installs only a missing selected provider from its official source and exposes its private bin', () => {
        const installation = fakeInstallation('opencode');
        const adapter = system(installation, '99.12.3');
        const environment = { PATH: '' };
        try {
            const provisioner = new AgentCliProvisioner(adapter);
            provisioner.provision('opencode', environment);
            provisioner.provision('opencode', environment);
            expect(adapter.installOfficial).toHaveBeenCalledTimes(1);
            expect(adapter.installOfficial).toHaveBeenCalledWith('opencode');
            expect(adapter.readVersion).toHaveBeenCalledWith(installation.executable, 'opencode', environment);
            expect(environment.PATH).toContain(installation.directory);
        } finally {
            rmSync(installation.root, { recursive: true, force: true });
        }
    });

    it('never replaces an explicitly selected executable', () => {
        const installation = fakeInstallation('cursor');
        const adapter = system(installation);
        try {
            expect(() => new AgentCliProvisioner(adapter).provision({
                provider: 'cursor', executable: join(installation.root, 'missing', 'agent'),
            }, { PATH: '' })).toThrow('operator executables are never installed or replaced');
            expect(adapter.installOfficial).not.toHaveBeenCalled();
        } finally {
            rmSync(installation.root, { recursive: true, force: true });
        }
    });

    it('rolls back PATH and removes a partial installation after version failure', () => {
        const installation = fakeInstallation('codex');
        const adapter = system(installation, '  \n');
        const environment = { PATH: 'existing-path' };
        expect(() => new AgentCliProvisioner(adapter).provision('codex', environment)).toThrow('empty version');
        expect(environment.PATH).toBe('existing-path');
        expect(existsSync(installation.root)).toBe(false);
    });

    it('rejects a missing CLI after the installer claims success', () => {
        const installation = fakeInstallation('cursor');
        const adapter = system(installation);
        rmSync(installation.executable);
        const environment = { PATH: '' };
        expect(() => new AgentCliProvisioner(adapter).provision('cursor', environment))
            .toThrow('did not expose its executable');
        expect(existsSync(installation.root)).toBe(false);
    });

    it('rejects an installer that exposes a different executable and restores an absent PATH', () => {
        const installation = fakeInstallation('opencode');
        const adapter = system({ ...installation, executable: join(installation.root, 'unexpected') });
        const environment: NodeJS.ProcessEnv = { Path: 'original-windows-path' };
        expect(() => new AgentCliProvisioner(adapter).provision('opencode', environment))
            .toThrow('resolved to another executable');
        expect(environment.PATH).toBeUndefined();
        expect(environment.Path).toBe('original-windows-path');
        expect(existsSync(installation.root)).toBe(false);
    });
});
