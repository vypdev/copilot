import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    installOfficialAgentCli, installerEnvironment,
    parseCursorWindowsInstaller, selectOpenCodeWindowsAsset,
} from '../agent_official_installer';

jest.mock('node:child_process', () => ({ execFileSync: jest.fn() }));
jest.mock('../windows_runtime_acl', () => ({ makeWindowsRuntimePathPrivate: jest.fn() }));
const execute = execFileSync as jest.Mock;

beforeEach(() => execute.mockReset());

describe('official agent installer boundaries', () => {
    it('passes only toolchain variables into installers, never Action or model credentials', () => {
        const environment = installerEnvironment('/private/agent-job', {
            PATH: '/usr/bin', SystemRoot: 'C:\\Windows', OS: 'Windows_NT', GITHUB_TOKEN: 'secret',
            CODEX_API_KEY: 'secret', OPENAI_API_KEY: 'secret', CURSOR_API_KEY: 'secret',
            NPM_TOKEN: 'secret', HOME: '/operator/home', CODEX_HOME: '/operator/codex',
        });
        expect(environment.PATH).toBe('/usr/bin');
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
            if (file === 'curl') {
                expect(args.at(-1)).toBe('https://chatgpt.com/codex/install.sh');
                expect(args).toContain('--max-filesize');
                return Buffer.from('#!/bin/sh\n');
            } else if (file === 'sh') {
                const binary = join(options.env.CODEX_INSTALL_DIR!, 'codex');
                mkdirSync(options.env.CODEX_INSTALL_DIR!, { recursive: true });
                writeFileSync(binary, '#!/bin/sh\n');
            } else {
                throw new Error(`Unexpected installer command ${file}`);
            }
        });
        const installed = installOfficialAgentCli('codex');
        try {
            expect(installed.executable).toBe(realpathSync(join(installed.directory, 'codex')));
            expect(existsSync(installed.executable)).toBe(true);
            expect(readFileSync(join(installed.root, 'install.sh'), 'utf8')).toBe('#!/bin/sh\n');
            expect(execute).toHaveBeenCalledTimes(2);
            const installerEnvironmentUsed = execute.mock.calls[1][2].env as NodeJS.ProcessEnv;
            expect(installerEnvironmentUsed.GITHUB_TOKEN).toBeUndefined();
            expect(installerEnvironmentUsed.CODEX_API_KEY).toBeUndefined();
        } finally {
            rmSync(installed.root, { recursive: true, force: true });
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
                        mkdirSync(options.env.CODEX_INSTALL_DIR!, { recursive: true });
                        writeFileSync(join(options.env.CODEX_INSTALL_DIR!, 'codex.exe'), 'native fixture');
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
});
