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
        readVersion: jest.fn((_executable: string, _provider: AgentProvider, _environment: NodeJS.ProcessEnv) => version),
        readLatestVersion: jest.fn(() => '0.159.2'),
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

    it('uses a private official update when a newer stable Codex release is proven', () => {
        const old = fakeInstallation('codex');
        const updated = fakeInstallation('codex');
        const adapter = system(updated);
        adapter.readVersion.mockImplementation((path: string) => path === 'codex'
            ? 'codex-cli 0.149.1' : 'codex-cli 0.159.2');
        const environment = { PATH: old.directory };
        try {
            new AgentCliProvisioner(adapter).provision('codex', environment);
            expect(adapter.readLatestVersion).toHaveBeenCalledWith('codex');
            expect(adapter.installOfficial).toHaveBeenCalledTimes(1);
            expect(environment.PATH?.split(require('node:path').delimiter)[0]).toBe(updated.directory);
            expect(existsSync(old.executable)).toBe(true);
        } finally {
            rmSync(old.root, { recursive: true, force: true });
            rmSync(updated.root, { recursive: true, force: true });
        }
    });

    it.each(['codex-cli 0.159.2', 'codex-cli 0.160.0', 'unparseable-version'])(
        'keeps an installed %s when no newer release is proven', (version) => {
            const installation = fakeInstallation('codex');
            const adapter = system(installation, version);
            try {
                new AgentCliProvisioner(adapter).provision('codex', { PATH: installation.directory });
                expect(adapter.installOfficial).not.toHaveBeenCalled();
            } finally {
                rmSync(installation.root, { recursive: true, force: true });
            }
        },
    );

    it('uses the installed CLI if the official update check is unavailable', () => {
        const installation = fakeInstallation('codex');
        const adapter = system(installation, 'codex-cli 0.149.1');
        adapter.readLatestVersion.mockImplementation(() => { throw new Error('network unavailable'); });
        try {
            new AgentCliProvisioner(adapter).provision('codex', { PATH: installation.directory });
            expect(adapter.installOfficial).not.toHaveBeenCalled();
        } finally {
            rmSync(installation.root, { recursive: true, force: true });
        }
    });

    it('removes an update that does not actually advance the selected CLI', () => {
        const old = fakeInstallation('codex');
        const updated = fakeInstallation('codex');
        const adapter = system(updated, 'codex-cli 0.149.1');
        const environment = { PATH: old.directory };
        expect(() => new AgentCliProvisioner(adapter).provision('codex', environment))
            .toThrow('did not provide the newer release');
        expect(environment.PATH).toBe(old.directory);
        expect(existsSync(old.executable)).toBe(true);
        expect(existsSync(updated.root)).toBe(false);
        rmSync(old.root, { recursive: true, force: true });
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
            expect(adapter.readVersion).toHaveBeenCalledTimes(1);
            expect(adapter.readVersion.mock.calls[0][0].toLowerCase()).toBe(installation.executable.toLowerCase());
            expect(adapter.readVersion.mock.calls[0].slice(1)).toEqual(['opencode', environment]);
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
            expect(adapter.readLatestVersion).not.toHaveBeenCalled();
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
