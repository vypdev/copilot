import { chmodSync, chownSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentProvider } from '../../../domain/agent';
import { AgentCliError } from '../../../data/repository/agent_cli_contracts';
import { AgentExecutionPlanner, type AgentExecutionPlanningSystem } from '../agent_execution_planner';
import { getAgentRuntimeManifestEntry } from '../agent_runtime_manifest';
import { verifyWindowsRuntimePathPrivate } from '../windows_runtime_acl';

const unixIt = process.platform === 'win32' ? it.skip : it;
const windowsIt = process.platform === 'win32' ? it : it.skip;
let systemExecutable = process.execPath;
let systemFixtureDirectory: string | undefined;

function system(provider: AgentProvider, workspace = process.cwd()): AgentExecutionPlanningSystem {
    return {
        resolveExecutable: jest.fn(() => systemExecutable),
        readVersion: jest.fn(() => getAgentRuntimeManifestEntry(provider).reviewedVersion),
        resolveWorkspace: jest.fn(() => workspace),
    };
}

describe('AgentExecutionPlanner', () => {
    beforeAll(() => {
        if (process.platform === 'win32') return;
        systemFixtureDirectory = mkdtempSync(join(tmpdir(), 'copilot-agent-system-executable-'));
        systemExecutable = join(systemFixtureDirectory, 'agent');
        writeFileSync(systemExecutable, '#!/bin/sh\nexit 0\n');
        chmodSync(systemExecutable, 0o700);
    });

    afterAll(() => {
        if (systemFixtureDirectory) rmSync(systemFixtureDirectory, { recursive: true, force: true });
    });

    windowsIt('preflights a reviewed local npm shim through PATH and an absolute selection', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-windows-system-'));
        const packageRoot = join(directory, 'node_modules', '@openai', 'codex');
        const shim = join(directory, 'codex.cmd');
        const runtimeDirectories: string[] = [];
        mkdirSync(join(packageRoot, 'bin'), { recursive: true });
        writeFileSync(shim, '@echo off\r\n');
        writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
            name: '@openai/codex', bin: { codex: 'bin/codex.js' },
        }));
        const version = getAgentRuntimeManifestEntry('codex').reviewedVersion;
        writeFileSync(join(packageRoot, 'bin', 'codex.js'), `process.stdout.write(${JSON.stringify(`${version}\n`)})`);
        const planner = new AgentExecutionPlanner();
        try {
            const byPath = planner.prepare({
                configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
                prompt: 'fixture', timeoutMs: 1_000, cwd: process.cwd(),
                environment: { PATH: directory, PATHEXT: '.cmd' },
            });
            runtimeDirectories.push(byPath.runtimeDirectory);
            expect(byPath.executable).toBe(process.execPath);
            expect(byPath.launcherArgv).toEqual([realpathSync(join(packageRoot, 'bin', 'codex.js'))]);
            expect(byPath.runtimeContract.version).toBe(version);
            expect(byPath.workspace).toBe(realpathSync(process.cwd()));

            const absolute = planner.prepare({
                configuration: { provider: 'codex', model: 'model', executable: shim }, capability: 'findings',
                prompt: 'fixture', timeoutMs: 1_000, cwd: process.cwd(),
                environment: { PATH: '', PATHEXT: '.cmd' },
            });
            runtimeDirectories.push(absolute.runtimeDirectory);
            expect(absolute.launcherArgv).toEqual(byPath.launcherArgv);
            expect(() => planner.prepare({
                configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
                prompt: 'fixture', timeoutMs: 1_000, cwd: process.cwd(),
                environment: { PATH: '', PATHEXT: '.cmd' },
            })).toThrow('not found on PATH');
        } finally {
            for (const runtimeDirectory of runtimeDirectories) rmSync(runtimeDirectory, { recursive: true, force: true });
            rmSync(directory, { recursive: true, force: true });
        }
    });

    unixIt('uses the default system for canonical workspace, PATH, executable, and runtime identity preflight', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-default-system-'));
        const executable = join(directory, 'codex');
        writeFileSync(executable, '#!/bin/sh\nprintf "codex-cli 0.156.1\\n"\n');
        chmodSync(executable, 0o700);
        const planner = new AgentExecutionPlanner();
        const plan = planner.prepare({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
            prompt: 'prompt', timeoutMs: 1_000, cwd: process.cwd(), environment: { PATH: directory },
        });
        try {
            expect(plan.executable).toBe(realpathSync(executable));
            expect(plan.runtimeContract.version).toBe('codex-cli 0.156.1');
        } finally {
            rmSync(plan.runtimeDirectory, { recursive: true, force: true });
            rmSync(directory, { recursive: true, force: true });
        }
    });

    unixIt('supports an exact absolute executable and rejects missing PATH candidates', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-absolute-system-'));
        const executable = join(directory, 'codex');
        writeFileSync(executable, '#!/bin/sh\nprintf "codex-cli 0.156.1\\n"\n');
        chmodSync(executable, 0o700);
        const planner = new AgentExecutionPlanner();
        const plan = planner.prepare({
            configuration: { provider: 'codex', model: 'model', executable }, capability: 'findings',
            prompt: 'prompt', timeoutMs: 1_000, cwd: process.cwd(), environment: { PATH: '' },
        });
        rmSync(plan.runtimeDirectory, { recursive: true, force: true });
        rmSync(directory, { recursive: true, force: true });
        expect(() => planner.prepare({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
            prompt: 'prompt', timeoutMs: 1_000, cwd: process.cwd(), environment: { PATH: '' },
        })).toThrow('not found on PATH');
    });

    it('rejects a cwd below the canonical repository root', () => {
        expect(() => new AgentExecutionPlanner().prepare({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
            prompt: 'prompt', timeoutMs: 1_000, cwd: join(process.cwd(), 'src'), environment: { PATH: '' },
        })).toThrow('canonical repository root');
    });

    it.each(['codex', 'opencode', 'cursor'] as const)('admits a complete %s plan after runtime identity preflight', (provider) => {
        const planningSystem = system(provider);
        const plan = new AgentExecutionPlanner(planningSystem).prepare({
            configuration: { provider, modelProvider: provider === 'cursor' ? 'cursor' : 'openai', model: 'model' },
            capability: 'fixer', prompt: 'prompt', timeoutMs: 10_000,
            environment: { PATH: '/usr/bin', GITHUB_TOKEN: 'secret', OPENAI_API_KEY: 'model-key', CURSOR_API_KEY: 'cursor-key' },
        });
        try {
            expect(plan).toMatchObject({
                provider, capability: 'fixer', workspaceMode: 'workspace-write',
                childNetwork: 'deny', approval: 'never', sessionPersistence: false,
                timeoutMs: 10_000, maxPromptBytes: 524_288, maxOutputBytes: 4_194_304,
            });
            expect(plan.executable).toBe(systemExecutable);
            expect(plan.runtimeContract.version).toBe(getAgentRuntimeManifestEntry(provider).reviewedVersion);
            expect(plan.environment).not.toHaveProperty('GITHUB_TOKEN');
            expect(plan.environment.GIT_TERMINAL_PROMPT).toBe('0');
            expect(plan.artifacts.length).toBeGreaterThan(0);
            for (const artifact of plan.artifacts) {
                if (process.platform === 'win32') {
                    expect(() => verifyWindowsRuntimePathPrivate(artifact.path, false)).not.toThrow();
                } else {
                    expect(statSync(artifact.path).mode & 0o077).toBe(0);
                }
                expect(readFileSync(artifact.path)).toBeDefined();
            }
        } finally {
            rmSync(plan.runtimeDirectory, { recursive: true, force: true });
        }
        expect(planningSystem.resolveExecutable).toHaveBeenCalledTimes(1);
        expect(planningSystem.readVersion).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['timeoutMs', 900_001], ['maxPromptBytes', 524_289], ['maxOutputBytes', 4_194_305],
        ['timeoutMs', 0], ['maxPromptBytes', 0], ['maxOutputBytes', 0],
    ] as const)('rejects invalid hard limit %s=%s before preflight', (field, value) => {
        const planningSystem = system('codex');
        expect(() => new AgentExecutionPlanner(planningSystem).prepare({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'prompt', timeoutMs: 1_000,
            [field]: value,
        })).toThrow('finite positive number');
        expect(planningSystem.resolveWorkspace).not.toHaveBeenCalled();
    });

    it('rejects prompts beyond their configured and global maximum', () => {
        expect(() => new AgentExecutionPlanner(system('codex')).prepare({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
            prompt: 'too large', timeoutMs: 1_000, maxPromptBytes: 2,
        })).toThrow('prompt exceeded');
    });

    it('accepts an operator-owned non-manifest version and records its identity', () => {
        const planningSystem = system('codex');
        planningSystem.readVersion = jest.fn(() => 'codex-cli 0.154.0');
        const plan = new AgentExecutionPlanner(planningSystem).prepare({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'prompt', timeoutMs: 1_000,
        });
        try {
            expect(plan.runtimeContract.version).toBe('codex-cli 0.154.0');
        } finally {
            rmSync(plan.runtimeDirectory, { recursive: true, force: true });
        }
    });

    it('rejects empty runtime identity before creating managed artifacts', () => {
        const planningSystem = system('codex');
        planningSystem.readVersion = jest.fn(() => '  \n');
        expect(() => new AgentExecutionPlanner(planningSystem).prepare({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'prompt', timeoutMs: 1_000,
        })).toThrow('local runtime contract could not be validated');
    });

    it('rejects ambient project configuration that could broaden provider authority', () => {
        const workspace = mkdtempSync(join(tmpdir(), 'copilot-agent-workspace-'));
        writeFileSync(join(workspace, 'opencode.json'), '{}');
        try {
            expect(() => new AgentExecutionPlanner(system('opencode', workspace)).prepare({
                configuration: { provider: 'opencode', model: 'model' }, capability: 'findings', prompt: 'prompt', timeoutMs: 1_000,
            })).toThrow('project configuration');
        } finally {
            rmSync(workspace, { recursive: true, force: true });
        }
    });

    it('rejects Cursor project configuration that could broaden provider authority', () => {
        const workspace = mkdtempSync(join(tmpdir(), 'copilot-agent-cursor-workspace-'));
        mkdirSync(join(workspace, '.cursor'));
        writeFileSync(join(workspace, '.cursor', 'sandbox.json'), '{}');
        try {
            expect(() => new AgentExecutionPlanner(system('cursor', workspace)).prepare({
                configuration: { provider: 'cursor', model: 'model' }, capability: 'findings', prompt: 'prompt', timeoutMs: 1_000,
            })).toThrow('project configuration');
        } finally {
            rmSync(workspace, { recursive: true, force: true });
        }
    });

    const invalidExecutables: Array<readonly [string, (path: string) => void]> = [
        ['directory', (path: string) => mkdirSync(path)],
        ...(process.platform === 'win32' ? [] : [
            ['writable file', (path: string) => { writeFileSync(path, '#!/bin/sh\n'); chmodSync(path, 0o777); }],
        ] as Array<readonly [string, (path: string) => void]>),
    ];
    it.each(invalidExecutables)('rejects an executable resolved to a %s', (_name, createCandidate) => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-invalid-executable-'));
        const executable = join(directory, 'codex');
        createCandidate(executable);
        const planningSystem = system('codex');
        planningSystem.resolveExecutable = jest.fn(() => executable);
        try {
            expect(() => new AgentExecutionPlanner(planningSystem).prepare({
                configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'prompt', timeoutMs: 1_000,
            })).toThrow(/regular file|group- or world-writable/);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('rejects an executable owned by neither the runner nor root', () => {
        if (typeof process.getuid !== 'function') return;
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-invalid-owner-'));
        const executable = join(directory, 'codex');
        writeFileSync(executable, '#!/bin/sh\n', { mode: 0o700 });
        let owner = statSync(executable).uid;
        if (owner === 0) {
            chownSync(executable, 1, statSync(executable).gid);
            owner = 1;
        }
        const planningSystem = system('codex');
        planningSystem.resolveExecutable = jest.fn(() => executable);
        const getuid = jest.spyOn(process, 'getuid').mockReturnValue(owner + 1);
        try {
            expect(() => new AgentExecutionPlanner(planningSystem).prepare({
                configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'prompt', timeoutMs: 1_000,
            })).toThrow('owned by the runner user or root');
        } finally {
            getuid.mockRestore();
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('preserves semantic planner errors and sanitizes non-Error failures', () => {
        const semanticSystem = system('codex');
        semanticSystem.resolveWorkspace = jest.fn(() => { throw new AgentCliError('semantic rejection', 'configuration'); });
        expect(() => new AgentExecutionPlanner(semanticSystem).prepare({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'prompt', timeoutMs: 1_000,
        })).toThrow('semantic rejection');

        const nonErrorSystem = system('codex');
        nonErrorSystem.resolveWorkspace = jest.fn(() => { throw 'opaque rejection'; });
        expect(() => new AgentExecutionPlanner(nonErrorSystem).prepare({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'prompt', timeoutMs: 1_000,
        })).toThrow('local runtime contract could not be validated');
    });

    it('cleans a created runtime directory when policy artifact serialization fails', () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(() => new AgentExecutionPlanner(system('codex')).prepare({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'prompt',
            timeoutMs: 1_000, outputSchema: circular,
        })).toThrow('execution plan rejected');
    });

    it('cleans its runtime directory if artifact materialization fails', () => {
        const planningSystem = system('codex');
        planningSystem.resolveExecutable = jest.fn(() => '/missing/codex');
        expect(() => new AgentExecutionPlanner(planningSystem).prepare({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'prompt', timeoutMs: 1_000,
        })).toThrow('accessible executable file');
        expect(existsSync('/missing/codex')).toBe(false);
    });
});
