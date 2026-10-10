import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAgentExecutableVersion, resolveAgentExecutableInvocation, resolveAgentExecutablePath } from '../agent_executable_invocation';

(process.platform === 'win32' ? it.skip : it)('keeps GitHub and model credentials out of the version probe', () => {
    const root = mkdtempSync(join(tmpdir(), 'copilot-agent-version-'));
    const executable = join(root, 'codex');
    writeFileSync(executable, '#!/bin/sh\nprintf "%s:%s:%s" "${GITHUB_TOKEN:-absent}" "${CODEX_API_KEY:-absent}" "${OPENAI_API_KEY:-absent}"\n');
    chmodSync(executable, 0o755);
    try {
        expect(readAgentExecutableVersion('codex', 'codex', {
            PATH: root, GITHUB_TOKEN: 'secret', CODEX_API_KEY: 'secret', OPENAI_API_KEY: 'secret',
        })).toBe('absent:absent:absent');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'copilot-agent-shim-'));
    const packageRoot = join(root, 'node_modules', '@openai', 'codex');
    mkdirSync(join(packageRoot, 'bin'), { recursive: true });
    const shim = join(root, 'codex.cmd');
    writeFileSync(shim, '@echo off\r\n');
    chmodSync(shim, 0o755);
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
        name: '@openai/codex', version: '0.156.1', bin: { codex: 'bin/codex.js' },
    }));
    writeFileSync(join(packageRoot, 'bin', 'codex.js'), 'process.stdout.write(JSON.stringify(process.argv.slice(2)))');
    return { root, packageRoot, shim };
}

describe('Windows npm agent executable resolution', () => {
    it('admits a native executable directly without a shell', () => {
        const executable = join(tmpdir(), 'codex.exe');
        expect(resolveAgentExecutableInvocation(executable, 'codex', 'win32')).toEqual({
            executable, prefixArgs: [],
        });
    });

    it('rejects a command shim belonging to another provider', () => {
        const data = fixture();
        try {
            expect(() => resolveAgentExecutableInvocation(data.shim, 'opencode', 'win32')).toThrow('does not match');
        } finally {
            rmSync(data.root, { recursive: true, force: true });
        }
    });

    it('rejects an absolute package bin path', () => {
        const data = fixture();
        try {
            writeFileSync(join(data.packageRoot, 'package.json'), JSON.stringify({
                name: '@openai/codex', bin: { codex: join(data.root, 'external.js') },
            }));
            expect(() => resolveAgentExecutableInvocation(data.shim, 'codex', 'win32')).toThrow('no safe executable');
        } finally {
            rmSync(data.root, { recursive: true, force: true });
        }
    });

    it('rejects a Windows drive-absolute package bin path on every host', () => {
        const data = fixture();
        try {
            writeFileSync(join(data.packageRoot, 'package.json'), JSON.stringify({
                name: '@openai/codex', bin: { codex: 'C:\\outside\\codex.exe' },
            }));
            expect(() => resolveAgentExecutableInvocation(data.shim, 'codex', 'win32')).toThrow('no safe executable');
        } finally {
            rmSync(data.root, { recursive: true, force: true });
        }
    });

    it('rejects malformed package metadata', () => {
        const data = fixture();
        try {
            writeFileSync(join(data.packageRoot, 'package.json'), '{invalid');
            expect(() => resolveAgentExecutableInvocation(data.shim, 'codex', 'win32')).toThrow();
        } finally {
            rmSync(data.root, { recursive: true, force: true });
        }
    });

    it('rejects a missing npm package instead of running the shim', () => {
        const data = fixture();
        try {
            rmSync(data.packageRoot, { recursive: true, force: true });
            expect(() => resolveAgentExecutableInvocation(data.shim, 'codex', 'win32')).toThrow();
        } finally {
            rmSync(data.root, { recursive: true, force: true });
        }
    });

    it('rejects a package bin that resolves to a directory', () => {
        const data = fixture();
        try {
            writeFileSync(join(data.packageRoot, 'package.json'), JSON.stringify({
                name: '@openai/codex', bin: { codex: 'bin' },
            }));
            expect(() => resolveAgentExecutableInvocation(data.shim, 'codex', 'win32')).toThrow('not a file');
        } finally {
            rmSync(data.root, { recursive: true, force: true });
        }
    });

    it('admits a reviewed package bin that is a native executable', () => {
        const data = fixture();
        try {
            const native = join(data.packageRoot, 'bin', 'codex.exe');
            writeFileSync(native, 'fixture binary');
            writeFileSync(join(data.packageRoot, 'package.json'), JSON.stringify({
                name: '@openai/codex', bin: { codex: 'bin/codex.exe' },
            }));
            expect(resolveAgentExecutableInvocation(data.shim, 'codex', 'win32')).toEqual({
                executable: realpathSync(native), prefixArgs: [],
            });
        } finally {
            rmSync(data.root, { recursive: true, force: true });
        }
    });

    it('resolves a reviewed npm shim to a direct Node invocation with literal argv', () => {
        const data = fixture();
        try {
            const node = join(data.root, 'node.exe');
            copyFileSync(process.execPath, node);
            chmodSync(node, 0o755);
            const environment = { PATH: data.root, PATHEXT: '.exe;.cmd' };
            const selected = resolveAgentExecutablePath('codex', environment, 'win32');
            const invocation = resolveAgentExecutableInvocation(selected, 'codex', 'win32', environment);
            expect(invocation.executable).toBe(realpathSync(node));
            const literal = '$(touch should-not-run) & <secret> "quoted"';
            const result = spawnSync(invocation.executable, [...invocation.prefixArgs, literal], {
                encoding: 'utf8', shell: false,
            });
            expect(result.status).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual([literal]);
        } finally {
            rmSync(data.root, { recursive: true, force: true });
        }
    });

    it('rejects package identity substitution and a bin that escapes the package', () => {
        const data = fixture();
        try {
            const manifest = join(data.packageRoot, 'package.json');
            writeFileSync(manifest, JSON.stringify({ name: 'attacker', bin: { codex: 'bin/codex.js' } }));
            expect(() => resolveAgentExecutableInvocation(data.shim, 'codex', 'win32')).toThrow('unexpected package');
            writeFileSync(manifest, JSON.stringify({ name: '@openai/codex', bin: { codex: '../../../outside.js' } }));
            writeFileSync(join(data.root, 'outside.js'), '');
            expect(() => resolveAgentExecutableInvocation(data.shim, 'codex', 'win32')).toThrow('escaped');
        } finally {
            rmSync(data.root, { recursive: true, force: true });
        }
    });

    it('rejects a missing, unsupported, or renamed bin without falling back to cmd', () => {
        const data = fixture();
        try {
            const manifest = join(data.packageRoot, 'package.json');
            writeFileSync(manifest, JSON.stringify({ name: '@openai/codex', bin: {} }));
            expect(() => resolveAgentExecutableInvocation(data.shim, 'codex', 'win32')).toThrow('no safe executable');
            writeFileSync(join(data.packageRoot, 'bin', 'codex.ps1'), '');
            writeFileSync(manifest, JSON.stringify({ name: '@openai/codex', bin: { codex: 'bin/codex.ps1' } }));
            expect(() => resolveAgentExecutableInvocation(data.shim, 'codex', 'win32')).toThrow('not a supported direct executable');
            expect(() => resolveAgentExecutableInvocation(join(data.root, 'other.cmd'), 'codex', 'win32'))
                .toThrow('does not match');
            expect(() => resolveAgentExecutableInvocation(join(data.root, 'codex.bat'), 'codex', 'win32'))
                .toThrow('native executable or a reviewed npm command shim');
        } finally {
            rmSync(data.root, { recursive: true, force: true });
        }
    });
});
