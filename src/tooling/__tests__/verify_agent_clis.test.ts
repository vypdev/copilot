import { spawnSync, execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';

const verifier = resolve(__dirname, '../../../scripts/verify-agent-clis.cjs');

function runVerifier(binDirectory: string, home: string, authRequired = true) {
    const windows = process.platform === 'win32';
    const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    return spawnSync(process.execPath, [verifier], {
        encoding: 'utf8',
        timeout: windows ? 45_000 : 20_000,
        env: {
            PATH: (windows ? [binDirectory, dirname(process.execPath), join(systemRoot, 'System32'), systemRoot,
                join(systemRoot, 'System32', 'Wbem'),
                join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0')]
                : [binDirectory, process.env.PATH || '']).join(delimiter),
            PATHEXT: '.CMD;.EXE',
            CODEX_HOME: home,
            HOME: home,
            USERPROFILE: home,
            COMSPEC: process.env.COMSPEC,
            OS: process.env.OS,
            SystemDrive: process.env.SystemDrive,
            SystemRoot: windows ? systemRoot : process.env.SystemRoot,
            WINDIR: windows ? systemRoot : process.env.WINDIR,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
            APPDATA: process.env.APPDATA,
            LOCALAPPDATA: process.env.LOCALAPPDATA,
            ALLUSERSPROFILE: process.env.ALLUSERSPROFILE,
            CommonProgramFiles: process.env.CommonProgramFiles,
            'CommonProgramFiles(x86)': process.env['CommonProgramFiles(x86)'],
            ProgramFiles: process.env.ProgramFiles,
            'ProgramFiles(x86)': process.env['ProgramFiles(x86)'],
            ProgramData: process.env.ProgramData,
            PSModulePath: windows ? [join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'Modules'),
                join(programFiles, 'WindowsPowerShell', 'Modules')].join(delimiter) : undefined,
            USERDOMAIN: process.env.USERDOMAIN,
            USERNAME: process.env.USERNAME,
            LOGONSERVER: process.env.LOGONSERVER,
            AGENT_PROVIDER: 'codex',
            VERIFY_ALL_AGENT_CLIS: 'false',
            AGENT_AUTH_PREFLIGHT: authRequired ? 'required' : 'optional',
        },
    });
}

describe('standalone agent CLI verifier trust', () => {
    (process.platform === 'win32' ? it.skip : it)('runs a private fixture and rejects a writable one before any probe', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-cli-verifier-'));
        const executable = join(directory, 'codex');
        const marker = join(directory, 'started');
        try {
            writeFileSync(executable, `#!/bin/sh\n: > "${marker}"\nif [ "$1" = "--version" ]; then echo codex-cli-fixture; fi\n`);
            chmodSync(executable, 0o700);
            const safe = runVerifier(directory, directory);
            expect(safe.status).toBe(0);
            expect(safe.stdout).toContain('codex: available');
            expect(existsSync(marker)).toBe(true);

            rmSync(marker);
            chmodSync(executable, 0o777);
            const unsafe = runVerifier(directory, directory);
            expect(unsafe.status).toBe(1);
            expect(unsafe.stdout).toContain('codex: NOT_READY (help-trust-selected/unsafe-permissions)');
            expect(existsSync(marker)).toBe(false);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    (process.platform === 'win32' ? it : it.skip)('does not execute a writable Windows npm bin or shim', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-cli-verifier-win-'));
        const packageRoot = join(directory, 'node_modules', '@openai', 'codex');
        const marker = join(directory, 'started');
        const shim = join(directory, 'codex.cmd');
        try {
            mkdirSync(join(packageRoot, 'bin'), { recursive: true });
            writeFileSync(shim, '@echo off\r\n');
            writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
                name: '@openai/codex', bin: { codex: 'bin/codex.js' },
            }));
            writeFileSync(join(packageRoot, 'bin', 'codex.js'),
                `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);
            execFileSync('icacls.exe', [shim, '/grant', '*S-1-1-0:M'], { stdio: 'ignore' });

            const result = runVerifier(directory, directory);
            expect(result.status).toBe(1);
            expect(result.stdout).toContain('codex: NOT_READY (help-trust-selected/acl-writable)');
            expect(existsSync(marker)).toBe(false);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    }, 60_000);

    (process.platform === 'win32' ? it : it.skip)('resolves a private project-local npm shim to its sibling package', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-cli-verifier-local-'));
        const binDirectory = join(directory, 'node_modules', '.bin');
        const packageRoot = join(directory, 'node_modules', '@openai', 'codex');
        const marker = join(directory, 'started');
        try {
            mkdirSync(binDirectory, { recursive: true });
            mkdirSync(join(packageRoot, 'bin'), { recursive: true });
            writeFileSync(join(binDirectory, 'codex.cmd'), '@echo off\r\n');
            writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
                name: '@openai/codex', bin: { codex: 'bin/codex.js' },
            }));
            writeFileSync(join(packageRoot, 'bin', 'codex.js'),
                `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');\n` +
                `if (process.argv.includes('--version')) console.log('codex-local-fixture');\n` +
                `if (process.argv.includes('login')) process.exit(1);\n`);
            const result = runVerifier(binDirectory, directory, false);
            expect(result.status).toBe(0);
            expect(result.stdout).toContain('codex: available');
            expect(result.stdout).toContain('codex-local-fixture');
            expect(existsSync(marker)).toBe(true);
        } finally { rmSync(directory, { recursive: true, force: true }); }
    }, 75_000);
});
