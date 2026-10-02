import { spawnSync, execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

const verifier = resolve(__dirname, '../../../scripts/verify-agent-clis.cjs');

function runVerifier(binDirectory: string, home: string) {
    return spawnSync(process.execPath, [verifier], {
        encoding: 'utf8',
        timeout: 20_000,
        env: {
            PATH: [binDirectory, process.env.PATH || ''].join(delimiter),
            PATHEXT: '.CMD;.EXE',
            CODEX_HOME: home,
            HOME: home,
            USERPROFILE: home,
            SystemRoot: process.env.SystemRoot,
            WINDIR: process.env.WINDIR,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
            AGENT_PROVIDER: 'codex',
            VERIFY_ALL_AGENT_CLIS: 'false',
            AGENT_AUTH_PREFLIGHT: 'required',
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
            expect(unsafe.stdout).toContain('codex: NOT_READY');
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
            expect(result.stdout).toContain('codex: NOT_READY');
            expect(existsSync(marker)).toBe(false);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
});
