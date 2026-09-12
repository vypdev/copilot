import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    AgentCliProvisioner,
    agentExecutableExists,
    type AgentCliProvisioningSystem,
} from '../agent_cli_provisioner';

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

    it('accepts a preinstalled exact-manifest Codex CLI', () => {
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

    it('repairs a preinstalled non-manifest Codex version in auto mode', () => {
        const system = provisioningSystem(true, 'codex-cli 0.154.0');
        system.readVersion
            .mockReturnValueOnce('codex-cli 0.154.0')
            .mockReturnValueOnce('codex-cli 0.153.4');

        expect(() => new AgentCliProvisioner(system).provision('codex', {})).not.toThrow();
        expect(system.installPackage).toHaveBeenCalledWith('@openai/codex', '0.153.4');
        expect(system.readVersion).toHaveBeenCalledTimes(2);
    });

    it('rejects a non-manifest version when provisioning is disabled', () => {
        const system = provisioningSystem(true, 'codex-cli 0.154.0');

        expect(() => new AgentCliProvisioner(system).provision('codex', {
            AGENT_PROVISIONING: 'disabled',
        })).toThrow('version mismatch');
        expect(system.installPackage).not.toHaveBeenCalled();
    });

    it('does not replace an explicit executable when its version mismatches', () => {
        const system = provisioningSystem(true, 'codex-cli 0.154.0');

        expect(() => new AgentCliProvisioner(system).provision({
            provider: 'codex',
            executable: '/controlled/codex',
        }, {})).toThrow('version mismatch');
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
        expect(system.readVersion).toHaveBeenCalledWith('codex', process.env);
    });

    it.each([
        ['codex', '@openai/codex', '0.153.4', 'codex-cli 0.153.4'],
        ['opencode', 'opencode-ai', '1.18.3', '1.18.3'],
    ] as const)('provisions missing %s from its manifest version', (provider, packageName, version, output) => {
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

    it('requires the exact Cursor runtime to be preinstalled', () => {
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

    it('normalizes non-Error version failures without hiding their cause', () => {
        const system = provisioningSystem(true);
        system.readVersion.mockImplementation(() => { throw 'unparseable'; });
        expect(() => new AgentCliProvisioner(system).provision('codex', {})).toThrow('unparseable');
    });
});
