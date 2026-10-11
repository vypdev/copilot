import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { checkAgentAuthentication } from '../../../data/repository/agent_authentication';
import { runAgentCli } from '../../../data/repository/agent_cli_execution';
import { AgentExecutionPlanner } from '../agent_execution_planner';
import { validateAgentExecutableFile } from '../agent_executable_file';
import { installerEnvironment } from '../agent_official_installer';
import { buildWindowsAclProbeEnvironment } from '../windows_executable_trust.cjs';
import { prepareUntrustedCommandEnvironment } from '../../untrusted_command_environment';
import { createPrivateAgentInstallRoot, prepareWindowsInstallRoot,
    securePrivateInstalledAgent, selectPrivateInstallRoot } from '../agent_private_install_root';
import {
    makeWindowsRuntimePathPrivate,
    matchesWindowsRuntimePrincipal,
    isLocalWindowsAdministrator,
    verifyWindowsRuntimePathPrivate,
    verifyWindowsAgentExecutableAcl,
} from '../windows_runtime_acl';

const windowsIt = process.platform === 'win32' ? it : it.skip;

windowsIt('preflights a private agent replacement inside the isolated verification profile and temp directory', () => {
    const runtime = prepareUntrustedCommandEnvironment(process.env);
    const keys = ['HOME', 'USERPROFILE', 'TMP', 'TEMP', 'TMPDIR', 'RUNNER_TEMP'] as const;
    const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    let installRoot: string | undefined;
    try {
        for (const key of keys) process.env[key] = runtime.environment[key];
        installRoot = createPrivateAgentInstallRoot();
        expect(installRoot.startsWith(runtime.environment.RUNNER_TEMP)).toBe(true);
        const executable = join(installRoot, 'dummy.exe');
        writeFileSync(executable, 'local verification fixture');
        expect(securePrivateInstalledAgent(installRoot, executable)).toBe(executable);
        expect(() => verifyWindowsAgentExecutableAcl(executable)).not.toThrow();
    } finally {
        if (installRoot) rmSync(installRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        for (const key of keys) {
            if (original[key] === undefined) delete process.env[key];
            else process.env[key] = original[key];
        }
        runtime.cleanup();
    }
}, 90_000);

windowsIt('runs exact Windows system-root validation and PowerShell under the verification environment without dirtying the checkout', () => {
    const root = mkdtempSync(join(tmpdir(), 'copilot-verify-windows-cache-'));
    const environment = prepareUntrustedCommandEnvironment(process.env);
    try {
        execFileSync('git', ['init', '-q', root], { stdio: 'ignore' });
        const modulePath = join(__dirname, '..', 'windows_system_root.cjs');
        const script = `const {spawnSync}=require('node:child_process');const {join}=require('node:path');const root=require(${JSON.stringify(modulePath)}).trustedWindowsSystemRoot();const result=spawnSync(join(root,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; Get-FileHash -LiteralPath (Join-Path $env:SystemRoot 'System32/whoami.exe') | Out-Null; Start-Sleep -Seconds 1; Write-Output 'verified'"],{env:process.env,encoding:'utf8',timeout:60000,windowsHide:true});if(result.error||result.status!==0)process.exit(2);process.stdout.write(result.stdout.trim());`;
        const result = spawnSync(process.execPath, ['-e', script], {
            cwd: root, env: environment.environment, encoding: 'utf8', timeout: 70_000, windowsHide: true,
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(result.stdout).toBe('verified');
        expect(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' })).toBe('');
        expect(existsSync(join(root, 'Microsoft'))).toBe(false);
    } finally {
        environment.cleanup();
        rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
}, 75_000);

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
    const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const environment = {
        PATH: [binRoot, join(systemRoot, 'System32'), systemRoot,
            join(systemRoot, 'System32', 'Wbem'),
            join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0')].join(delimiter),
        PATHEXT: '.EXE;.CMD',
        COMSPEC: process.env.COMSPEC,
        OS: process.env.OS,
        SystemDrive: process.env.SystemDrive,
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        USERPROFILE: process.env.USERPROFILE,
        HOME: process.env.USERPROFILE,
        HOMEDRIVE: process.env.HOMEDRIVE,
        HOMEPATH: process.env.HOMEPATH,
        APPDATA: process.env.APPDATA,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        ALLUSERSPROFILE: process.env.ALLUSERSPROFILE,
        CommonProgramFiles: process.env.CommonProgramFiles,
        'CommonProgramFiles(x86)': process.env['CommonProgramFiles(x86)'],
        ProgramFiles: process.env.ProgramFiles,
        'ProgramFiles(x86)': process.env['ProgramFiles(x86)'],
        ProgramData: process.env.ProgramData,
        PSModulePath: [join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'Modules'),
            join(programFiles, 'WindowsPowerShell', 'Modules')].join(delimiter),
        PUBLIC: process.env.PUBLIC,
        USERDOMAIN: process.env.USERDOMAIN,
        USERNAME: process.env.USERNAME,
        LOGONSERVER: process.env.LOGONSERVER,
        PROCESSOR_ARCHITECTURE: process.env.PROCESSOR_ARCHITECTURE,
        NUMBER_OF_PROCESSORS: process.env.NUMBER_OF_PROCESSORS,
        SESSIONNAME: process.env.SESSIONNAME,
    };
    return { root, workspace, environment, node };
}

function prepare(workspace: string, environment: NodeJS.ProcessEnv, timeoutMs = 5_000) {
    const priorActions = process.env.GITHUB_ACTIONS;
    const priorWorkspace = process.env.GITHUB_WORKSPACE;
    process.env.GITHUB_ACTIONS = 'true';
    process.env.GITHUB_WORKSPACE = workspace;
    try {
        return new AgentExecutionPlanner().prepare({
            configuration: { provider: 'codex', modelProvider: 'openai', model: 'fixture-model' },
            capability: 'findings', prompt: 'fixture prompt', timeoutMs,
            cwd: workspace, environment,
        });
    } finally {
        if (priorActions === undefined) delete process.env.GITHUB_ACTIONS;
        else process.env.GITHUB_ACTIONS = priorActions;
        if (priorWorkspace === undefined) delete process.env.GITHUB_WORKSPACE;
        else process.env.GITHUB_WORKSPACE = priorWorkspace;
    }
}

describe('isolated Windows agent runtime', () => {
    it('bounds ACL PowerShell probes to system modules and disables their checkout-relative cache', () => {
        expect(buildWindowsAclProbeEnvironment('C:\\Windows')).toEqual({
            SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows', PATH: 'C:\\Windows\\System32',
            PSModulePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules', PSModuleAnalysisCachePath: 'NUL',
        });
    });
    it('does not inherit credentials, host profiles or a poisoned cache in trusted descriptor probes', () => {
        const previous = process.env.PSModuleAnalysisCachePath;
        process.env.PSModuleAnalysisCachePath = 'poisoned-workspace-cache';
        try {
            const environment = buildWindowsAclProbeEnvironment('C:\\Windows');
            for (const key of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'CODEX_HOME', 'GITHUB_TOKEN', 'OPENAI_API_KEY']) {
                expect(environment).not.toHaveProperty(key);
            }
            expect(environment.PSModuleAnalysisCachePath).toBe('NUL');
            expect(process.env.PSModuleAnalysisCachePath).toBe('poisoned-workspace-cache');
        } finally {
            if (previous === undefined) delete process.env.PSModuleAnalysisCachePath;
            else process.env.PSModuleAnalysisCachePath = previous;
        }
    });
    windowsIt.each([true, false])('runs the exact ACL probe with host application data present=%s without creating checkout cache files', hostDataPresent => {
        const fixture = fakeRuntime('process.stdout.write("fixture")');
        try {
            const environment: NodeJS.ProcessEnv = { ...fixture.environment,
                PSModulePath: join(fixture.workspace, 'untrusted-modules'),
                PSModuleAnalysisCachePath: join(fixture.workspace, 'poisoned-cache'),
            };
            for (const key of ['APPDATA', 'LOCALAPPDATA']) {
                if (hostDataPresent) {
                    environment[key] = join(fixture.root, key);
                    mkdirSync(environment[key]!);
                } else delete environment[key];
            }
            const script = `require(${JSON.stringify(require.resolve('../windows_executable_trust.cjs'))}).verifyWindowsAgentExecutableAcl(process.argv[1]);process.stdout.write('verified');`;
            const result = spawnSync(fixture.node, ['-e', script, fixture.node], {
                cwd: fixture.workspace, env: environment, encoding: 'utf8', timeout: 30_000, windowsHide: true,
            });
            expect(result.error).toBeUndefined();
            expect(result.status).toBe(0);
            expect(result.stdout).toBe('verified');
            expect(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: fixture.workspace, encoding: 'utf8' }).trim()).toBe('');
            expect(existsSync(join(fixture.workspace, 'Microsoft'))).toBe(false);
            expect(existsSync(join(fixture.workspace, 'poisoned-cache'))).toBe(false);
        } finally { rmSync(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
    });

    it('falls back from an unsafe installation parent and fails closed when none is safe', () => {
        const attempts: string[] = [];
        const prepare = (parent: string): string => {
            attempts.push(parent);
            if (parent === 'unsafe') throw new Error('unsafe ancestor');
            return 'private root';
        };
        expect(selectPrivateInstallRoot(['unsafe', 'safe', 'SAFE'], prepare)).toBe('private root');
        expect(attempts).toEqual(['unsafe', 'safe']);
        expect(() => selectPrivateInstallRoot(['unsafe'], prepare)).toThrow('No protected agent installation directory');
    });

    it('rejects an installer output outside its private root before changing its ACL', () => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-install-boundary-'));
        const other = mkdtempSync(join(tmpdir(), 'copilot-install-outside-'));
        const file = join(other, 'codex.exe');
        try {
            writeFileSync(file, 'dummy');
            expect(() => securePrivateInstalledAgent(root, file)).toThrow('escaped its private directory');
        } finally {
            rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            rmSync(other, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    });

    it('cleans a candidate whose ancestor check fails before trying another parent', () => {
        const parent = mkdtempSync(join(tmpdir(), 'copilot-install-parent-'));
        let candidate = '';
        let checks = 0;
        try {
            expect(() => prepareWindowsInstallRoot(parent, probe => {
                candidate = dirname(probe);
                checks += 1;
                throw new Error('unsafe ancestor fixture');
            })).toThrow('unsafe ancestor fixture');
            expect(candidate).not.toBe('');
            expect(checks).toBe(1);
            expect(existsSync(candidate)).toBe(false);
        } finally {
            rmSync(parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    });

    it('recreates a private root once after an explicit ACL timeout', () => {
        const parent = mkdtempSync(join(tmpdir(), 'copilot-install-timeout-'));
        const candidates: string[] = [];
        try {
            const prepared = prepareWindowsInstallRoot(parent, probe => {
                candidates.push(dirname(probe));
                if (candidates.length === 1) {
                    throw Object.assign(new Error('fixture ACL timeout'), { code: 'ETIMEDOUT' });
                }
                expect(existsSync(candidates[0])).toBe(false);
            });
            expect(candidates).toHaveLength(2);
            expect(prepared).toBe(candidates[1]);
            expect(prepared).not.toBe(candidates[0]);
        } finally {
            rmSync(parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    });

    windowsIt('preflights a private install root and secures a local dummy replacement', () => {
        const root = createPrivateAgentInstallRoot();
        const bin = join(root, 'bin');
        const file = join(bin, 'codex.exe');
        try {
            mkdirSync(bin);
            writeFileSync(file, 'dummy executable fixture');
            expect(securePrivateInstalledAgent(root, file)).toBe(file);
            expect(() => verifyWindowsAgentExecutableAcl(file)).not.toThrow();
        } finally {
            rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }, 90_000);

    windowsIt('accepts the official Codex Windows junction layout inside its private root', () => {
        const root = createPrivateAgentInstallRoot();
        const standalone = join(root, '.codex', 'packages', 'standalone');
        const release = join(standalone, 'releases', '1.2.3-win32-x64');
        const binary = join(release, 'bin', 'codex.exe');
        const visible = join(root, 'bin', 'codex.exe');
        try {
            mkdirSync(dirname(binary), { recursive: true });
            writeFileSync(binary, 'dummy Codex executable fixture');
            symlinkSync(release, join(standalone, 'current'), 'junction');
            symlinkSync(join(standalone, 'current', 'bin'), join(root, 'bin'), 'junction');
            expect(securePrivateInstalledAgent(root, visible)).toBe(realpathSync(binary));
            expect(() => verifyWindowsAgentExecutableAcl(binary)).not.toThrow();
        } finally {
            rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }, 45_000);

    windowsIt('rejects an official-looking junction that leaves the private root', () => {
        const root = createPrivateAgentInstallRoot();
        const outside = mkdtempSync(join(tmpdir(), 'copilot-install-outside-'));
        try {
            writeFileSync(join(outside, 'codex.exe'), 'outside executable fixture');
            symlinkSync(outside, join(root, 'bin'), 'junction');
            expect(() => securePrivateInstalledAgent(root, join(root, 'bin', 'codex.exe')))
                .toThrow('escaped its private directory');
        } finally {
            rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            rmSync(outside, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }, 45_000);

    windowsIt('loads Windows PowerShell 5.1 hash modules under the private installer environment', () => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-installer-shell-'));
        const fixture = join(root, 'fixture.txt');
        try {
            writeFileSync(fixture, 'isolated installer module fixture');
            const environment = installerEnvironment(root, process.env);
            expect(environment.PSModulePath).not.toContain('PowerShell\\7');
            expect(environment.GITHUB_TOKEN).toBeUndefined();
            const systemRoot = environment.SystemRoot || 'C:\\Windows';
            const command = `$ErrorActionPreference='Stop'; (Get-FileHash -LiteralPath '${fixture.replace(/'/gu, "''")}' -Algorithm SHA256).Hash`;
            const result = spawnSync(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
                '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
                Buffer.from(command, 'utf16le').toString('base64'),
            ], { env: environment, encoding: 'utf8', timeout: 60_000, windowsHide: true });
            expect((result.error as NodeJS.ErrnoException | undefined)?.code).toBeUndefined();
            expect(result.status).toBe(0);
            expect(result.stdout.trim().toLowerCase()).toBe(
                createHash('sha256').update('isolated installer module fixture').digest('hex'),
            );
        } finally {
            rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }, 75_000);

    windowsIt.each([true, false])('keeps a Git checkout clean during installer PowerShell startup with host app data present=%s', hostDataPresent => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-installer-cache-'));
        const workspace = join(root, 'workspace');
        const installer = join(root, 'installer');
        try {
            mkdirSync(workspace);
            mkdirSync(installer);
            execFileSync('git', ['init', '-q', workspace], { stdio: 'ignore' });
            const source: NodeJS.ProcessEnv = { ...process.env, PSModuleAnalysisCachePath: join(workspace, 'poisoned-cache') };
            if (!hostDataPresent) {
                delete source.APPDATA;
                delete source.LOCALAPPDATA;
            }
            const environment = installerEnvironment(installer, source);
            expect(environment.PSModuleAnalysisCachePath).toBe('NUL');
            expect(source.PSModuleAnalysisCachePath).toBe(join(workspace, 'poisoned-cache'));
            const command = "$ErrorActionPreference='Stop'; Get-Command Get-FileHash | Out-Null; Get-FileHash -LiteralPath (Join-Path $env:SystemRoot 'System32/whoami.exe') | Out-Null; Start-Sleep -Seconds 1; Write-Output 'verified'";
            const result = spawnSync(join(environment.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
                '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64'),
            ], { cwd: workspace, env: environment, encoding: 'utf8', timeout: 60_000, windowsHide: true });
            expect(result.error).toBeUndefined();
            expect(result.status).toBe(0);
            expect(result.stdout.trim()).toBe('verified');
            expect(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: workspace, encoding: 'utf8' })).toBe('');
            expect(existsSync(join(workspace, 'Microsoft'))).toBe(false);
            expect(existsSync(join(workspace, 'poisoned-cache'))).toBe(false);
        } finally {
            rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }, 75_000);

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
            rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
            rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
            rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
            rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
            rmSync(markerDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            rmSync(runtime.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
            rmSync(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }, 30_000);

    windowsIt.each([true, false])('starts PowerShell from the actual private shell policy with host app data present=%s and leaves the checkout clean', async hostDataPresent => {
        const command = "$ErrorActionPreference='Stop'; Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $env:SystemRoot 'System32/whoami.exe') | Out-Null; Write-Output 'ready'";
        const source = `if(process.argv.includes('--version')){process.stdout.write('codex-cli 0.156.1')}else{
            const {spawnSync}=require('node:child_process');const {join}=require('node:path');
            const args=process.argv;const setting=args.find(x=>x.startsWith('shell_environment_policy.include_only='));
            const keys=JSON.parse(setting.slice(setting.indexOf('=')+1));const env={};
            for(const key of keys){if(process.env[key]!==undefined)env[key]=process.env[key]}
            for(const key of ['APPDATA','LOCALAPPDATA','PSModuleAnalysisCachePath']){const value=args.find(x=>x.startsWith('shell_environment_policy.set.'+key+'='));env[key]=JSON.parse(value.slice(value.indexOf('=')+1))}
            const result=spawnSync(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',${JSON.stringify(command)}],{env,encoding:'utf8',timeout:15000,windowsHide:true});
            if(result.status!==0)process.exit(2);process.stdout.write(result.stdout.trim());process.stdin.resume();
        }`;
        const fixture = fakeRuntime(source);
        try {
            const environment = { ...fixture.environment };
            if (!hostDataPresent) {
                delete environment.APPDATA;
                delete environment.LOCALAPPDATA;
            }
            const plan = prepare(fixture.workspace, environment, 20_000);
            for (const kind of ['roaming', 'local']) {
                expect(() => verifyWindowsRuntimePathPrivate(join(plan.runtimeDirectory, 'shell', kind), true)).not.toThrow();
            }
            await expect(runAgentCli(plan, 'read-only native shell fixture')).resolves.toBe('ready');
            expect(execFileSync('git', ['status', '--porcelain'], { cwd: fixture.workspace, encoding: 'utf8' }).trim()).toBe('');
            expect(existsSync(join(fixture.workspace, 'Microsoft'))).toBe(false);
            expect(existsSync(plan.runtimeDirectory)).toBe(false);
        } finally {
            rmSync(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }, 60_000);

    windowsIt('starts native PowerShell before applying the shell policy with a private parent cache and clean checkout', async () => {
        const command = "$ErrorActionPreference='Stop'; if (-not [IO.Path]::IsPathRooted($env:PSModuleAnalysisCachePath)) { throw 'Unbounded module cache' }; Get-Command Get-FileHash -ErrorAction Stop | Out-Null; Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $env:SystemRoot 'System32/whoami.exe') | Out-Null; Write-Output 'ready'";
        const source = `if(process.argv.includes('--version')){process.stdout.write('codex-cli 0.156.1')}else{
            const {spawnSync}=require('node:child_process');const {join}=require('node:path');
            if(!process.env.PSModuleAnalysisCachePath.includes('copilot-agent-runtime-'))process.exit(3);
            const result=spawnSync(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-Command',${JSON.stringify(command)}],{env:process.env,encoding:'utf8',timeout:15000,windowsHide:true});
            if(result.status!==0)process.exit(2);process.stdout.write(result.stdout.trim());process.stdin.resume();
        }`;
        const fixture = fakeRuntime(source);
        try {
            const environment = { ...fixture.environment, PSModuleAnalysisCachePath: join(fixture.workspace, 'untrusted-cache') };
            delete environment.APPDATA;
            delete environment.LOCALAPPDATA;
            const plan = prepare(fixture.workspace, environment, 20_000);
            await expect(runAgentCli(plan, 'parent native shell fixture')).resolves.toBe('ready');
            expect(execFileSync('git', ['status', '--porcelain'], { cwd: fixture.workspace, encoding: 'utf8' }).trim()).toBe('');
            expect(existsSync(join(fixture.workspace, 'Microsoft'))).toBe(false);
            expect(existsSync(plan.runtimeDirectory)).toBe(false);
        } finally {
            rmSync(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }, 60_000);

    windowsIt('reports fake Codex readiness through the standalone operator verifier', () => {
        const source = 'if(process.argv.includes("--version")){process.stdout.write("codex-cli 0.156.1")}'
            + 'else if(process.argv.includes("--help")){process.stdout.write("usage: codex exec")}'
            + 'else if(process.argv.includes("login")){process.exit(1)}else{process.exit(2)}';
        const fixture = fakeRuntime(source);
        try {
            expect(fixture.environment.PSModulePath).toContain('WindowsPowerShell');
            expect(fixture.environment.PSModulePath).not.toContain('PowerShell\\7');
            const systemRoot = fixture.environment.SystemRoot || fixture.environment.WINDIR || 'C:\\Windows';
            const probes = [
                ['identity', join(systemRoot, 'System32', 'whoami.exe'), ['/user', '/fo', 'csv', '/nh']],
                ['powershell', join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
                    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Write-Output ready']],
            ] as const;
            for (const [name, executable, args] of probes) {
                const probe = spawnSync(executable, [...args], {
                    env: fixture.environment, encoding: 'utf8', timeout: name === 'powershell' ? 15_000 : 5_000,
                    windowsHide: true,
                });
                if (probe.status !== 0) {
                    const code = probe.error && 'code' in probe.error ? probe.error.code : `exit-${probe.status}`;
                    throw new Error(`Native ${name} probe failed: ${code}`);
                }
            }
            const result = spawnSync(process.execPath, [join(process.cwd(), 'scripts', 'verify-agent-clis.cjs')], {
                cwd: fixture.workspace,
                env: {
                    ...fixture.environment,
                    AGENT_PROVIDER: 'codex',
                    AGENT_AUTH_PREFLIGHT: 'optional',
                    CODEX_HOME: join(fixture.root, 'no-session'),
                },
                encoding: 'utf8', timeout: 60_000,
            });
            expect({ status: result.status, output: result.stdout.trim() }).toEqual({
                status: 0,
                output: expect.stringContaining('codex: available'),
            });
            expect(result.stdout).toContain('codex-cli 0.156.1');
        } finally {
            rmSync(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }, 75_000);

    windowsIt('times out a fake agent and removes its private artifacts', async () => {
        const source = 'if(process.argv.includes("--version")){process.stdout.write("codex-cli 0.156.1")}'
            + 'else{setInterval(()=>{},1000)}';
        const fixture = fakeRuntime(source);
        try {
            const plan = prepare(fixture.workspace, fixture.environment, 100);
            await expect(runAgentCli(plan, 'fixture prompt')).rejects.toMatchObject({ category: 'timeout' });
            expect(existsSync(plan.runtimeDirectory)).toBe(false);
        } finally {
            rmSync(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }, 30_000);

    windowsIt('cancels a fake agent and its descendant before cleaning artifacts', async () => {
        const pidFile = join(tmpdir(), `copilot-agent-descendant-${process.pid}-${Date.now()}.txt`);
        const source = 'if(process.argv.includes("--version")){process.stdout.write("codex-cli 0.156.1")}else{'
            + 'const c=require("node:child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});'
            + `require("node:fs").writeFileSync(${JSON.stringify(pidFile)},String(c.pid));`
            + 'setInterval(()=>{},1000)}';
        const fixture = fakeRuntime(source);
        const controller = new AbortController();
        const originalSystemRoot = process.env.SystemRoot;
        const originalWindir = process.env.WINDIR;
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
            process.env.SystemRoot = fixture.root;
            process.env.WINDIR = fixture.root;
            controller.abort();
            await expect(pending).rejects.toMatchObject({ category: 'cancelled' });
            expect(existsSync(plan.runtimeDirectory)).toBe(false);
            expect(() => process.kill(descendantPid!, 0)).toThrow();
        } finally {
            if (originalSystemRoot === undefined) delete process.env.SystemRoot;
            else process.env.SystemRoot = originalSystemRoot;
            if (originalWindir === undefined) delete process.env.WINDIR;
            else process.env.WINDIR = originalWindir;
            controller.abort();
            await pending?.catch(() => undefined);
            if (descendantPid) {
                try { execFileSync('taskkill.exe', ['/PID', String(descendantPid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* Already gone. */ }
            }
            rmSync(pidFile, { force: true });
            rmSync(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }, 30_000);
});
