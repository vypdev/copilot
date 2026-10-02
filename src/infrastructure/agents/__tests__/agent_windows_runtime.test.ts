import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAgentAuthentication } from '../../../data/repository/agent_authentication';
import { runAgentCli } from '../../../data/repository/agent_cli_execution';
import { AgentExecutionPlanner } from '../agent_execution_planner';
import { validateAgentExecutableFile } from '../agent_executable_file';
import {
    makeWindowsRuntimePathPrivate,
    matchesWindowsRuntimePrincipal,
    isLocalWindowsAdministrator,
    verifyWindowsRuntimePathPrivate,
    verifyWindowsAgentExecutableAcl,
} from '../windows_runtime_acl';

const windowsIt = process.platform === 'win32' ? it : it.skip;

function fakeRuntime(source: string) {
    const root = mkdtempSync(join(tmpdir(), 'copilot agent windows '));
    const binRoot = join(root, 'npm bin');
    const packageRoot = join(binRoot, 'node_modules', '@openai', 'codex');
    const node = join(binRoot, 'node.exe');
    const workspace = join(root, 'workspace');
    mkdirSync(join(packageRoot, 'bin'), { recursive: true });
    mkdirSync(workspace);
    writeFileSync(join(binRoot, 'codex.cmd'), '@echo off\r\n');
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
        name: '@openai/codex', version: '0.156.1', bin: { codex: 'bin/codex.js' },
    }));
    writeFileSync(join(packageRoot, 'bin', 'codex.js'), source);
    copyFileSync(process.execPath, node);
    makeWindowsRuntimePathPrivate(root, true);
    makeWindowsRuntimePathPrivate(binRoot, true);
    for (const path of [node, join(binRoot, 'codex.cmd'), join(packageRoot, 'bin', 'codex.js')]) {
        makeWindowsRuntimePathPrivate(path, false);
    }
    execFileSync('git', ['init', '-q', workspace], { stdio: 'ignore' });
    const environment = {
        PATH: binRoot,
        PATHEXT: '.EXE;.CMD',
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
    };
    return { root, workspace, environment, node };
}

function prepare(workspace: string, environment: NodeJS.ProcessEnv, timeoutMs = 5_000) {
    return new AgentExecutionPlanner().prepare({
        configuration: { provider: 'codex', modelProvider: 'openai', model: 'fixture-model' },
        capability: 'findings', prompt: 'fixture prompt', timeoutMs,
        cwd: workspace, environment,
    });
}

describe('isolated Windows agent runtime', () => {
    it('accepts the SDDL local administrator alias only for the verified local administrator', () => {
        const sid = 'S-1-5-21-100-200-300-500';
        expect(isLocalWindowsAdministrator(sid, 'RUNNER', 'runner')).toBe(true);
        expect(isLocalWindowsAdministrator(sid, 'DOMAIN', 'runner')).toBe(false);
        expect(isLocalWindowsAdministrator('S-1-5-21-100-200-300-1001', 'runner', 'runner')).toBe(false);
        expect(matchesWindowsRuntimePrincipal(sid, { sid, localAdministrator: false })).toBe(true);
        expect(matchesWindowsRuntimePrincipal('LA', { sid, localAdministrator: true })).toBe(true);
        expect(matchesWindowsRuntimePrincipal('LA', { sid, localAdministrator: false })).toBe(false);
        expect(matchesWindowsRuntimePrincipal('BA', { sid, localAdministrator: true })).toBe(false);
        expect(matchesWindowsRuntimePrincipal('WD', { sid, localAdministrator: true })).toBe(false);
    });

    windowsIt('rejects a managed directory ACL broadened to Everyone', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-acl-'));
        try {
            makeWindowsRuntimePathPrivate(directory, true);
            execFileSync('icacls.exe', [directory, '/grant', '*S-1-1-0:R'], { stdio: 'ignore' });
            expect(() => verifyWindowsRuntimePathPrivate(directory, true)).toThrow();
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    windowsIt('observes separate path and DACL lines in the icacls saved snapshot', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-icacls-format-'));
        const artifact = join(directory, 'artifact');
        const snapshot = join(directory, 'acl.txt');
        try {
            writeFileSync(artifact, 'fixture');
            execFileSync('icacls.exe', [artifact, '/save', snapshot], { stdio: 'ignore' });
            const lines = readFileSync(snapshot, 'utf16le').replace(/^\uFEFF/u, '').trim().split(/\r?\n/u);
            expect(lines).toHaveLength(2);
            expect(lines[0]).toContain('artifact');
            expect(lines[1]).toMatch(/^D:/u);
            makeWindowsRuntimePathPrivate(artifact, false);
            expect(() => verifyWindowsRuntimePathPrivate(artifact, false)).not.toThrow();
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    windowsIt('protects managed directory and artifacts with an owner-only ACL', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-acl-'));
        const artifact = join(directory, 'artifact');
        try {
            execFileSync('icacls.exe', [directory, '/grant', '*S-1-1-0:R'], { stdio: 'ignore' });
            makeWindowsRuntimePathPrivate(directory, true);
            writeFileSync(artifact, 'fixture');
            makeWindowsRuntimePathPrivate(artifact, false);
            expect(() => verifyWindowsRuntimePathPrivate(directory, true)).not.toThrow();
            expect(() => verifyWindowsRuntimePathPrivate(artifact, false)).not.toThrow();
            execFileSync('icacls.exe', [artifact, '/grant', '*S-1-1-0:R'], { stdio: 'ignore' });
            expect(() => verifyWindowsRuntimePathPrivate(artifact, false)).toThrow();
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    windowsIt('rejects an installed executable writable by Everyone without changing its ACL', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-executable-acl-'));
        const executable = join(directory, "agent's fixture.cmd");
        try {
            writeFileSync(executable, '@echo off\r\n');
            expect(() => verifyWindowsAgentExecutableAcl(executable)).not.toThrow();
            expect(() => validateAgentExecutableFile(executable)).not.toThrow();
            execFileSync('icacls.exe', [executable, '/grant', '*S-1-1-0:M'], { stdio: 'ignore' });
            expect(() => verifyWindowsAgentExecutableAcl(executable)).toThrow('writable by another principal');
            expect(() => validateAgentExecutableFile(executable)).toThrow('unsafe or unreadable Windows ACL');
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    windowsIt('does not run login status through a writable npm shim', () => {
        const markerDirectory = mkdtempSync(join(tmpdir(), 'copilot-login-marker-'));
        const marker = join(markerDirectory, 'ran');
        const runtime = fakeRuntime(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);
        try {
            const shim = join(runtime.root, 'npm bin', 'codex.cmd');
            execFileSync('icacls.exe', [shim, '/grant', '*S-1-1-0:M'], { stdio: 'ignore' });
            expect(checkAgentAuthentication(
                { provider: 'codex', model: 'fixture' },
                { ...runtime.environment, HOME: runtime.root },
            ).status).toBe('missing');
            expect(existsSync(marker)).toBe(false);
        } finally {
            rmSync(markerDirectory, { recursive: true, force: true });
            rmSync(runtime.root, { recursive: true, force: true });
        }
    });

    windowsIt('verifies a fake npm bin, passes a literal prompt, and removes private artifacts', async () => {
        const source = 'if(process.argv.includes("--version")){process.stdout.write("codex-cli 0.156.1")}'
            + 'else{process.stdin.pipe(process.stdout)}';
        const fixture = fakeRuntime(source);
        try {
            const plan = prepare(fixture.workspace, fixture.environment);
            expect(plan.executable.toLowerCase()).toBe(fixture.node.toLowerCase());
            expect(plan.launcherArgv).toHaveLength(1);
            await expect(runAgentCli(plan, 'literal & $(ignored) "quoted"')).resolves.toBe('literal & $(ignored) "quoted"');
            expect(existsSync(plan.runtimeDirectory)).toBe(false);
        } finally {
            rmSync(fixture.root, { recursive: true, force: true });
        }
    });

    windowsIt('reports fake Codex readiness through the standalone operator verifier', () => {
        const source = 'if(process.argv.includes("--version")){process.stdout.write("codex-cli 0.156.1")}'
            + 'else if(process.argv.includes("login")){process.exit(1)}else{process.stdin.resume()}';
        const fixture = fakeRuntime(source);
        try {
            const output = execFileSync(process.execPath, [join(process.cwd(), 'scripts', 'verify-agent-clis.cjs')], {
                cwd: fixture.workspace,
                env: {
                    ...fixture.environment,
                    AGENT_PROVIDER: 'codex',
                    AGENT_AUTH_PREFLIGHT: 'optional',
                    CODEX_HOME: join(fixture.root, 'no-session'),
                },
                encoding: 'utf8', timeout: 20_000,
            });
            expect(output).toContain('codex: available');
            expect(output).toContain('codex-cli 0.156.1');
        } finally {
            rmSync(fixture.root, { recursive: true, force: true });
        }
    });

    windowsIt('times out a fake agent and removes its private artifacts', async () => {
        const source = 'if(process.argv.includes("--version")){process.stdout.write("codex-cli 0.156.1")}'
            + 'else{setInterval(()=>{},1000)}';
        const fixture = fakeRuntime(source);
        try {
            const plan = prepare(fixture.workspace, fixture.environment, 100);
            await expect(runAgentCli(plan, 'fixture prompt')).rejects.toMatchObject({ category: 'timeout' });
            expect(existsSync(plan.runtimeDirectory)).toBe(false);
        } finally {
            rmSync(fixture.root, { recursive: true, force: true });
        }
    });

    windowsIt('cancels a fake agent and its descendant before cleaning artifacts', async () => {
        const pidFile = join(tmpdir(), `copilot-agent-descendant-${process.pid}-${Date.now()}.txt`);
        const source = 'if(process.argv.includes("--version")){process.stdout.write("codex-cli 0.156.1")}else{'
            + 'const c=require("node:child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});'
            + `require("node:fs").writeFileSync(${JSON.stringify(pidFile)},String(c.pid));`
            + 'setInterval(()=>{},1000)}';
        const fixture = fakeRuntime(source);
        const controller = new AbortController();
        let pending: Promise<string> | undefined;
        let descendantPid: number | undefined;
        try {
            const plan = prepare(fixture.workspace, fixture.environment);
            pending = runAgentCli(plan, 'fixture prompt', controller.signal);
            const deadline = Date.now() + 3_000;
            while (!existsSync(pidFile) && Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, 25));
            }
            expect(existsSync(pidFile)).toBe(true);
            descendantPid = Number(readFileSync(pidFile, 'utf8'));
            controller.abort();
            await expect(pending).rejects.toMatchObject({ category: 'cancelled' });
            expect(existsSync(plan.runtimeDirectory)).toBe(false);
            expect(() => process.kill(descendantPid!, 0)).toThrow();
        } finally {
            controller.abort();
            await pending?.catch(() => undefined);
            if (descendantPid) {
                try { execFileSync('taskkill.exe', ['/PID', String(descendantPid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* Already gone. */ }
            }
            rmSync(pidFile, { force: true });
            rmSync(fixture.root, { recursive: true, force: true });
        }
    }, 15_000);
});
