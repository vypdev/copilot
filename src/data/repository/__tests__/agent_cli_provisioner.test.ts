import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
    AgentCliProvisioner,
    agentExecutableExists,
    type AgentCliProvisioningSystem,
} from '../agent_cli_provisioner';

jest.mock('node:child_process', () => ({ execFileSync: jest.fn() }));

function provisioningSystem(
    executableAvailable: boolean | readonly boolean[] = false,
    version = 'codex-cli 0.153.4',
): AgentCliProvisioningSystem & { installPackage: jest.Mock; readVersion: jest.Mock } {
    const availability = Array.isArray(executableAvailable) ? [...executableAvailable] : [executableAvailable];
    return {
        executableExists: jest.fn(() => availability.length > 1 ? availability.shift()! : availability[0]),
        readVersion: jest.fn(() => version),
        installPackage: jest.fn(),
    };
}

describe('AgentCliProvisioner', () => {
    beforeEach(() => {
        (execFileSync as unknown as jest.Mock).mockReset();
    });

    it('resolves bare executables through PATH and rejects missing path selections', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-cli-path-test-'));
        const executable = join(directory, 'codex');
        try {
            writeFileSync(executable, '#!/bin/sh\nexit 0\n');
            chmodSync(executable, 0o755);
            expect(agentExecutableExists('codex', { PATH: directory })).toBe(true);
            expect(agentExecutableExists('missing', { PATH: directory })).toBe(false);
            expect(agentExecutableExists('missing', {})).toBe(false);
            expect(agentExecutableExists(join(directory, 'missing'), {})).toBe(false);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('accepts a preinstalled Codex CLI without replacing an operator-owned runtime', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-cli-test-'));
        const executable = join(directory, 'codex');
        try {
            writeFileSync(executable, '#!/bin/sh\necho "codex-cli 0.153.4"\n');
            chmodSync(executable, 0o755);
            expect(() => new AgentCliProvisioner().provision({ provider: 'codex', executable }, { PATH: directory })).not.toThrow();
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('uses system npm and version commands for a forced pinned installation', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-cli-default-system-'));
        const executable = join(directory, 'codex');
        try {
            writeFileSync(executable, '#!/bin/sh\nexit 0\n');
            chmodSync(executable, 0o755);
            (execFileSync as unknown as jest.Mock).mockImplementation((command: string, args: string[]) => {
                if (command === 'npm') return Buffer.alloc(0);
                if (command === 'codex' && args[0] === '--version') return 'codex-cli 0.153.4\n';
                throw new Error(`Unexpected command: ${command}`);
            });

            new AgentCliProvisioner().provision('codex', {
                PATH: directory,
                AGENT_PROVISIONING: 'always',
            });

            expect(execFileSync).toHaveBeenCalledWith(
                'npm',
                ['install', '--global', '@openai/codex@0.153.4'],
                { stdio: 'inherit' },
            );
            expect(execFileSync).toHaveBeenCalledWith(
                'codex',
                ['--version'],
                expect.objectContaining({ encoding: 'utf8', timeout: 15_000 }),
            );
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('accepts a preinstalled non-manifest Codex version without reinstalling it', () => {
        const system = provisioningSystem(true, 'codex-cli 0.154.0');

        expect(() => new AgentCliProvisioner(system).provision({
            provider: 'codex',
            executable: '   ',
        }, {})).not.toThrow();
        expect(system.installPackage).not.toHaveBeenCalled();
        expect(system.readVersion).not.toHaveBeenCalled();
    });

    it('accepts an available operator runtime when provisioning is disabled', () => {
        const system = provisioningSystem(true, 'codex-cli 0.154.0');

        expect(() => new AgentCliProvisioner(system).provision('codex', {
            AGENT_PROVISIONING: 'disabled',
        })).not.toThrow();
        expect(system.installPackage).not.toHaveBeenCalled();
        expect(system.readVersion).not.toHaveBeenCalled();
    });

    it('accepts but never replaces an available explicit executable', () => {
        const system = provisioningSystem(true, 'codex-cli 0.154.0');

        expect(() => new AgentCliProvisioner(system).provision({
            provider: 'codex',
            executable: '/controlled/codex',
        }, { AGENT_PROVISIONING: 'always' })).not.toThrow();
        expect(system.installPackage).not.toHaveBeenCalled();
        expect(system.readVersion).not.toHaveBeenCalled();
    });

    it('never installs a missing explicit executable', () => {
        const system = provisioningSystem(false);

        expect(() => new AgentCliProvisioner(system).provision({
            provider: 'codex',
            executable: '/controlled/codex',
        }, {})).toThrow('explicit executables are never installed or replaced');
        expect(system.installPackage).not.toHaveBeenCalled();
    });

    it('fails clearly when provisioning is disabled and the CLI is absent', () => {
        expect(() => new AgentCliProvisioner(provisioningSystem(false)).provision('cursor', {
            PATH: '', AGENT_PROVISIONING: 'disabled',
        })).toThrow('provisioning is disabled');
    });

    it('rejects unknown provisioning modes before touching the runner', () => {
        expect(() => new AgentCliProvisioner().provision('codex', {
            PATH: '', AGENT_PROVISIONING: 'sometimes',
        })).toThrow('AGENT_PROVISIONING must be one of');
    });

    it('does not provision the same executable twice', () => {
        const system = provisioningSystem([false, true]);
        const provisioner = new AgentCliProvisioner(system);
        provisioner.provision({ provider: 'codex' }, { PATH: '' });
        provisioner.provision({ provider: 'codex' }, { PATH: '' });
        expect(system.installPackage).toHaveBeenCalledTimes(1);
        expect(system.readVersion).toHaveBeenCalledTimes(1);
    });

    it('uses the process environment when no explicit environment is supplied', () => {
        const system = provisioningSystem(true);
        new AgentCliProvisioner(system).provision('codex');
        expect(system.executableExists).toHaveBeenCalledWith('codex', process.env);
        expect(system.readVersion).not.toHaveBeenCalled();
    });

    it.each([
        ['codex', '@openai/codex', '0.153.4', 'codex-cli 0.153.4'],
        ['opencode', 'opencode-ai', '1.18.3', '1.18.3'],
    ] as const)('provisions missing %s from its pinned installation', (provider, packageName, version, output) => {
        const system = provisioningSystem([false, true], output);
        new AgentCliProvisioner(system).provision(provider, { PATH: '' });
        expect(system.installPackage).toHaveBeenCalledWith(packageName, version);
    });

    it('always reinstalls and then validates the exact version', () => {
        const system = provisioningSystem(true);
        new AgentCliProvisioner(system).provision('codex', { AGENT_PROVISIONING: 'always' });
        expect(system.installPackage).toHaveBeenCalledWith('@openai/codex', '0.153.4');
        expect(system.readVersion).toHaveBeenCalledTimes(1);
    });

    it('requires Cursor to be preinstalled because it has no reviewed installer', () => {
        const system = provisioningSystem(false);
        expect(() => new AgentCliProvisioner(system).provision('cursor', {})).toThrow('must be preinstalled');
        expect(system.installPackage).not.toHaveBeenCalled();
    });

    it('fails when installation does not make the exact executable available', () => {
        const system = provisioningSystem([false, false]);
        expect(() => new AgentCliProvisioner(system).provision({ provider: 'codex', executable: '  ' }, {
            PATH: '',
        })).toThrow('not available on PATH');
    });

    it('normalizes non-Error post-install version failures without hiding their cause', () => {
        const system = provisioningSystem([false, true]);
        system.readVersion.mockImplementation(() => { throw 'unparseable'; });
        expect(() => new AgentCliProvisioner(system).provision('codex', {})).toThrow('unparseable');
    });

    it('rejects a pinned package when its installed CLI reports another version', () => {
        const system = provisioningSystem([false, true], 'codex-cli 0.154.0');
        expect(() => new AgentCliProvisioner(system).provision('codex', {})).toThrow('installed CLI version mismatch');
    });
});
