import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { trustedSystemPath } from '../agent_trusted_system_tools';
import { trustedWindowsSystemRoot } from '../windows_system_root.cjs';
import { verifyWindowsAgentExecutableAcl } from '../windows_runtime_acl';
import { PrivateInstalledAgentValidationError, securePrivateInstalledAgent } from '../agent_private_install_root';
import {
    installOfficialAgentCli, installedFileFailureReason, installerEnvironment, OfficialAgentInstallationError,
    parseCursorWindowsInstaller, selectOpenCodeWindowsAsset,
} from '../agent_official_installer';

jest.mock('node:child_process', () => ({ execFileSync: jest.fn() }));
jest.mock('../windows_runtime_acl', () => ({
    makeWindowsRuntimePathPrivate: jest.fn(), verifyWindowsAgentExecutableAcl: jest.fn(),
}));
const execute = execFileSync as jest.Mock;

beforeEach(() => execute.mockReset());

describe('official agent installer boundaries', () => {
    it.each([
        [new PrivateInstalledAgentValidationError('invalid-file', 'private marker'), 'invalid-file'],
        [new PrivateInstalledAgentValidationError('unsafe-link', 'private marker'), 'unsafe-link'],
        [new PrivateInstalledAgentValidationError('acl-hardening', 'private marker'), 'acl-hardening'],
        [new PrivateInstalledAgentValidationError('acl-ancestor', 'private marker'), 'acl-ancestor'],
        [new PrivateInstalledAgentValidationError('acl-file', 'private marker'), 'acl-file'],
        [new PrivateInstalledAgentValidationError('acl-inspection', 'private marker'), 'acl-inspection'],
        [new PrivateInstalledAgentValidationError('access-denied', 'private marker'), 'access-denied'],
        [Object.assign(new Error('secret-bearing missing path'), { code: 'ENOENT' }), 'missing-file'],
        [Object.assign(new Error('secret-bearing denied path'), { code: 'EPERM' }), 'access-denied'],
        [Object.assign(new Error('secret-bearing link path'), { code: 'ELOOP' }), 'unsafe-link'],
        [new Error('secret-bearing unclassified diagnostic'), 'unknown'],
    ])('maps installed-file failure %# to a closed reason', (failure, reason) => {
        expect(installedFileFailureReason(failure)).toBe(reason);
        expect(installedFileFailureReason(failure)).not.toContain('secret-bearing');
    });

    it('passes only toolchain variables into installers, never Action or model credentials', () => {
        const environment = installerEnvironment('/private/agent-job', {
            PATH: '/tmp/attacker:/usr/bin', SystemRoot: 'C:\\attacker', WINDIR: 'C:\\attacker',
            SystemDrive: 'D:', OS: 'Windows_NT', GITHUB_TOKEN: 'secret',
            CODEX_API_KEY: 'secret', OPENAI_API_KEY: 'secret', CURSOR_API_KEY: 'secret',
            NPM_TOKEN: 'secret', HOME: '/operator/home', CODEX_HOME: '/operator/codex',
            PSModulePath: 'C:\\Program Files\\PowerShell\\7\\Modules',
        });
        expect(environment.PATH).toBe(trustedSystemPath());
        expect(environment.PATH).not.toContain('/tmp/attacker');
        if (process.platform === 'win32') {
            expect(environment.SystemRoot).toBe(trustedWindowsSystemRoot());
            expect(environment.SystemDrive).toBe(trustedWindowsSystemRoot().slice(0, 2));
            expect(environment.COMSPEC).toBe(join(trustedWindowsSystemRoot(), 'System32', 'cmd.exe'));
            expect(environment.PSModulePath).toContain('WindowsPowerShell\\v1.0\\Modules');
            expect(environment.PSModulePath).not.toContain('PowerShell\\7');
            expect(environment.APPDATA).toBe(join('/private/agent-job', 'roaming'));
        }
        expect(environment.OS).toBe('Windows_NT');
        expect(environment.HOME).toBe('/private/agent-job');
        expect(environment.CODEX_HOME).toBe(join('/private/agent-job', '.codex'));
        for (const name of ['GITHUB_TOKEN', 'CODEX_API_KEY', 'OPENAI_API_KEY', 'CURSOR_API_KEY', 'NPM_TOKEN']) {
            expect(environment[name]).toBeUndefined();
        }
    });

    it('accepts only the versioned Cursor archive named by its official Windows script', () => {
        const script = "$downloadUrl = 'https://downloads.cursor.com/lab/2026.10.01-e373342/'\n$version = '2026.10.01-e373342'";
        expect(parseCursorWindowsInstaller(script, 'x64'))
            .toBe('https://downloads.cursor.com/lab/2026.10.01-e373342/windows/x64/agent-cli-package.zip');
        expect(parseCursorWindowsInstaller(script, 'arm64')).toContain('/windows/arm64/');
        expect(() => parseCursorWindowsInstaller(script.replace("$version = '2026.10.01-e373342'", "$version = 'other'"), 'x64'))
            .toThrow('metadata changed');
        expect(() => parseCursorWindowsInstaller(script.replace('downloads.cursor.com', 'attacker.invalid'), 'x64'))
            .toThrow('metadata changed');
    });

    it('selects only an official OpenCode release asset and rejects redirected metadata', () => {
        const release = {
            tag_name: 'v1.2.3', assets: [{
                name: 'opencode-windows-x64-baseline.zip',
                browser_download_url: 'https://github.com/anomalyco/opencode/releases/download/v1.2.3/opencode-windows-x64-baseline.zip',
                digest: 'sha256:abc',
            }],
        };
        expect(selectOpenCodeWindowsAsset(release, 'x64')).toEqual({
            url: release.assets[0].browser_download_url, digest: 'sha256:abc',
        });
        expect(() => selectOpenCodeWindowsAsset({ ...release, assets: [{ ...release.assets[0], browser_download_url: 'https://attacker.invalid/opencode.zip' }] }, 'x64'))
            .toThrow('unavailable');
        expect(() => selectOpenCodeWindowsAsset({ ...release, tag_name: 'latest' }, 'x64')).toThrow('tag is invalid');
    });

    it('rejects an oversized script before writing it or executing the installer', () => {
        let root = '';
        execute.mockImplementation((file: string, _args: string[], options: { env: NodeJS.ProcessEnv }) => {
            if (!file.toLowerCase().includes('curl')) throw new Error('Installer ran after oversized download.');
            root = options.env.HOME!;
            return Buffer.alloc(1_048_577, 65);
        });
        expect(() => installOfficialAgentCli('codex')).toThrow('size limit');
        expect(root).not.toBe('');
        expect(existsSync(root)).toBe(false);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    (process.platform === 'win32' ? it : it.skip)('rejects oversized release metadata before writing it', () => {
        let root = '';
        execute.mockImplementation((file: string, _args: string[], options: { env: NodeJS.ProcessEnv }) => {
            if (!file.toLowerCase().endsWith('curl.exe')) throw new Error('Release handling ran after oversized metadata.');
            root = options.env.HOME!;
            return Buffer.alloc(2_097_153, 65);
        });
        expect(() => installOfficialAgentCli('opencode')).toThrow('size limit');
        expect(root).not.toBe('');
        expect(existsSync(root)).toBe(false);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    (process.platform === 'win32' ? it : it.skip)('removes a failed archive download before extraction', () => {
        let root = '';
        execute.mockImplementation((file: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
            if (!file.toLowerCase().endsWith('curl.exe')) throw new Error('Extraction ran after failed download.');
            root = options.env.HOME!;
            if (args.at(-1)?.includes('cursor.com/install')) {
                return Buffer.from("$downloadUrl = 'https://downloads.cursor.com/lab/2026.10.01-e373342/'\n$version = '2026.10.01-e373342'");
            }
            expect(args[args.indexOf('--max-filesize') + 1]).toBe('268435456');
            expect(options).toMatchObject({ maxBuffer: 268_435_457 });
            throw new Error('Simulated transfer exceeded its byte limit.');
        });
        expect(() => installOfficialAgentCli('cursor')).toThrow('size limit');
        expect(root).not.toBe('');
        expect(existsSync(root)).toBe(false);
        expect(execute).toHaveBeenCalledTimes(2);
    });

    (process.platform === 'win32' ? it.skip : it)('downloads and executes a fake official shell installer inside a private job directory', () => {
        execute.mockImplementation((file: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
            if (file === '/usr/bin/curl') {
                expect(args.at(-1)).toBe('https://chatgpt.com/codex/install.sh');
                expect(args).toContain('--max-filesize');
                expect(options.env.PATH).not.toContain('/tmp/attacker');
                return Buffer.from('#!/bin/sh\n');
            } else if (file === '/bin/sh') {
                const release = join(options.env.CODEX_HOME!, 'packages', 'standalone', 'releases', '1.2.3');
                const current = join(options.env.CODEX_HOME!, 'packages', 'standalone', 'current');
                const binary = join(release, 'bin', 'codex');
                mkdirSync(dirname(binary), { recursive: true });
                mkdirSync(options.env.CODEX_INSTALL_DIR!, { recursive: true });
                writeFileSync(binary, '#!/bin/sh\n');
                chmodSync(binary, 0o755);
                symlinkSync(release, current);
                symlinkSync(join(current, 'bin', 'codex'), join(options.env.CODEX_INSTALL_DIR!, 'codex'));
            } else {
                throw new Error(`Unexpected installer command ${file}`);
            }
        });
        const installed = installOfficialAgentCli('codex');
        try {
            expect(installed.executable).toBe(realpathSync(join(installed.directory, 'codex')));
            expect(installed.directory).toBe(join(installed.root, 'bin'));
            expect(existsSync(installed.executable)).toBe(true);
            expect(readFileSync(join(installed.root, 'install.sh'), 'utf8')).toBe('#!/bin/sh\n');
            expect(execute).toHaveBeenCalledTimes(2);
            expect(execute.mock.calls.map(([file]) => file)).toEqual(['/usr/bin/curl', '/bin/sh']);
            const installerEnvironmentUsed = execute.mock.calls[1][2].env as NodeJS.ProcessEnv;
            expect(installerEnvironmentUsed.GITHUB_TOKEN).toBeUndefined();
            expect(installerEnvironmentUsed.CODEX_API_KEY).toBeUndefined();
        } finally {
            rmSync(installed.root, { recursive: true, force: true });
        }
    });

    (process.platform === 'win32' ? it.skip : it).each([
        ['opencode', '.opencode/bin/opencode'],
        ['cursor', '.local/bin/agent'],
    ] as const)('uses the trusted Bash for a fake %s installer', (provider, installedPath) => {
        execute.mockImplementation((file: string, _args: string[], options: { env: NodeJS.ProcessEnv }) => {
            expect(options.env.PATH).toBe(['/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'));
            if (file === '/usr/bin/curl') return Buffer.from('#!/bin/bash\n');
            if (file === '/bin/bash') {
                const binary = join(options.env.HOME!, installedPath);
                mkdirSync(dirname(binary), { recursive: true });
                writeFileSync(binary, 'native fixture');
                chmodSync(binary, 0o755);
                return Buffer.alloc(0);
            }
            throw new Error(`Unexpected installer command ${file}`);
        });
        const installed = installOfficialAgentCli(provider);
        try {
            expect(execute.mock.calls.map(([file]) => file)).toEqual(['/usr/bin/curl', '/bin/bash']);
            expect(existsSync(installed.executable)).toBe(true);
        } finally {
            rmSync(installed.root, { recursive: true, force: true });
        }
    });

    (process.platform === 'win32' ? it.skip : it)('rejects an official installer link that escapes its private root', () => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-install-link-'));
        const outside = mkdtempSync(join(tmpdir(), 'copilot-install-outside-'));
        const link = join(root, 'codex');
        try {
            const executable = join(outside, 'codex');
            writeFileSync(executable, '#!/bin/sh\n');
            chmodSync(executable, 0o755);
            symlinkSync(executable, link);
            expect(() => securePrivateInstalledAgent(root, link)).toThrow('escaped its private directory');
        } finally {
            rmSync(root, { recursive: true, force: true });
            rmSync(outside, { recursive: true, force: true });
        }
    });

    (process.platform === 'win32' ? it.skip : it)('rejects an intermediate link outside the private root and a dangling command', () => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-install-links-'));
        const outside = mkdtempSync(join(tmpdir(), 'copilot-install-outside-'));
        try {
            const executable = join(outside, 'codex');
            writeFileSync(executable, '#!/bin/sh\n');
            chmodSync(executable, 0o755);
            symlinkSync(outside, join(root, 'bin'));
            expect(() => securePrivateInstalledAgent(root, join(root, 'bin', 'codex')))
                .toThrow('escaped its private directory');
            symlinkSync(join(root, 'missing'), join(root, 'codex'));
            expect(() => securePrivateInstalledAgent(root, join(root, 'codex'))).toThrow();
        } finally {
            rmSync(root, { recursive: true, force: true });
            rmSync(outside, { recursive: true, force: true });
        }
    });

    (process.platform === 'win32' ? it : it.skip)('installs each Windows provider from a fake official native source', () => {
        for (const provider of ['codex', 'cursor', 'opencode'] as const) {
            execute.mockReset();
            let root = '';
            execute.mockImplementation((file: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
                if (file.toLowerCase().endsWith('curl.exe')) {
                    root = root || options.env.HOME!;
                    const url = args.at(-1) || '';
                    const content = url.includes('cursor.com/install')
                        ? "$downloadUrl = 'https://downloads.cursor.com/lab/2026.10.01-e373342/'\n$version = '2026.10.01-e373342'"
                        : url.includes('api.github.com')
                            ? JSON.stringify({ tag_name: 'v1.2.3', assets: [{
                                name: `opencode-windows-${process.arch}-baseline.zip`,
                                browser_download_url: `https://github.com/anomalyco/opencode/releases/download/v1.2.3/opencode-windows-${process.arch}-baseline.zip`,
                            }] })
                            : 'fake official payload';
                    return Buffer.from(content);
                } else if (file.toLowerCase().endsWith('powershell.exe')) {
                    if (args.includes('-File')) {
                        expect(options.env.OS).toBe('Windows_NT');
                        const standalone = join(options.env.CODEX_HOME!, 'packages', 'standalone');
                        const release = join(standalone, 'releases', '1.2.3-win32-x64');
                        mkdirSync(join(release, 'bin'), { recursive: true });
                        writeFileSync(join(release, 'bin', 'codex.exe'), 'native fixture');
                        symlinkSync(release, join(standalone, 'current'), 'junction');
                        symlinkSync(join(standalone, 'current', 'bin'), options.env.CODEX_INSTALL_DIR!, 'junction');
                    } else if (provider === 'cursor') {
                        const packageRoot = join(root, 'extracted', 'dist-package');
                        mkdirSync(packageRoot, { recursive: true });
                        writeFileSync(join(packageRoot, 'cursor-agent.exe'), 'native fixture');
                    } else {
                        const packageRoot = join(root, 'extracted', 'release');
                        mkdirSync(packageRoot, { recursive: true });
                        writeFileSync(join(packageRoot, 'opencode.exe'), 'native fixture');
                    }
                } else {
                    throw new Error(`Unexpected installer command ${file}`);
                }
            });
            const installed = installOfficialAgentCli(provider);
            try {
                expect(existsSync(installed.executable)).toBe(true);
                expect(installed.executable.toLowerCase()).toContain(`${provider === 'cursor' ? 'agent' : provider}.exe`);
                if (provider === 'codex') {
                    expect(installed.executable).toBe(realpathSync(join(installed.directory, 'codex.exe')));
                    expect(installed.directory).toBe(join(installed.root, 'bin'));
                }
                expect(execute.mock.calls.some(([file]) => String(file).toLowerCase().includes('npm'))).toBe(false);
                const limits = execute.mock.calls
                    .filter(([file]) => String(file).toLowerCase().endsWith('curl.exe'))
                    .map(([, args, options]) => ({
                        curlLimit: args[args.indexOf('--max-filesize') + 1],
                        bufferLimit: options.maxBuffer,
                    }));
                expect(limits).toEqual(provider === 'codex'
                    ? [{ curlLimit: '1048576', bufferLimit: 1_048_577 }]
                    : provider === 'cursor'
                        ? [{ curlLimit: '1048576', bufferLimit: 1_048_577 },
                            { curlLimit: '268435456', bufferLimit: 268_435_457 }]
                        : [{ curlLimit: '2097152', bufferLimit: 2_097_153 },
                            { curlLimit: '268435456', bufferLimit: 268_435_457 }]);
            } finally {
                rmSync(installed.root, { recursive: true, force: true });
            }
        }
    });

    (process.platform === 'win32' ? it : it.skip)('classifies a rejected private executable ancestor without publishing its path', () => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-install-acl-'));
        const binary = join(root, 'codex.exe');
        writeFileSync(binary, 'native fixture');
        (verifyWindowsAgentExecutableAcl as jest.Mock).mockImplementationOnce(() => {
            throw new Error(`Unsafe Windows executable ancestor ${root}: secret-bearing ACL detail`);
        });
        try {
            expect(() => securePrivateInstalledAgent(root, binary)).toThrow(
                expect.objectContaining({ reason: 'acl-ancestor', message: 'Could not verify the installed agent ACL.' }),
            );
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    (process.platform === 'win32' ? it : it.skip)('reports a bounded installer stage and code without raw stderr', () => {
        execute.mockImplementation((file: string) => {
            if (file.toLowerCase().endsWith('curl.exe')) return Buffer.from('fixture script');
            throw Object.assign(new Error('secret-bearing installer error'), {
                status: 1, stderr: Buffer.from('Get-FileHash: secret-bearing installer stderr'),
            });
        });
        try {
            installOfficialAgentCli('codex');
            throw new Error('Expected a fixture installer failure.');
        } catch (error) {
            expect(error).toBeInstanceOf(OfficialAgentInstallationError);
            expect(error).toMatchObject({ stage: 'installer-script', exitCode: 1, reason: 'hash-module' });
            expect((error as Error).message).not.toContain('secret-bearing');
        }
    });
});
