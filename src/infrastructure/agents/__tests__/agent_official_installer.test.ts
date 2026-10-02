import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
            PATH: '/usr/bin', SystemRoot: 'C:\\Windows', GITHUB_TOKEN: 'secret',
            CODEX_API_KEY: 'secret', OPENAI_API_KEY: 'secret', CURSOR_API_KEY: 'secret',
            NPM_TOKEN: 'secret', HOME: '/operator/home', CODEX_HOME: '/operator/codex',
        });
        expect(environment.PATH).toBe('/usr/bin');
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

    (process.platform === 'win32' ? it.skip : it)('downloads and executes a fake official shell installer inside a private job directory', () => {
        execute.mockImplementation((file: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
            if (file === 'curl') {
                const destination = args[args.indexOf('--output') + 1];
                writeFileSync(destination, '#!/bin/sh\n');
                expect(args.at(-1)).toBe('https://chatgpt.com/codex/install.sh');
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
                    const destination = args[args.indexOf('--output') + 1];
                    root = root || dirname(destination);
                    const url = args.at(-1) || '';
                    const content = url.includes('cursor.com/install')
                        ? "$downloadUrl = 'https://downloads.cursor.com/lab/2026.10.01-e373342/'\n$version = '2026.10.01-e373342'"
                        : url.includes('api.github.com')
                            ? JSON.stringify({ tag_name: 'v1.2.3', assets: [{
                                name: `opencode-windows-${process.arch}-baseline.zip`,
                                browser_download_url: `https://github.com/anomalyco/opencode/releases/download/v1.2.3/opencode-windows-${process.arch}-baseline.zip`,
                            }] })
                            : 'fake official payload';
                    writeFileSync(destination, content);
                } else if (file.toLowerCase().endsWith('powershell.exe')) {
                    if (args.includes('-File')) {
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
            } finally {
                rmSync(installed.root, { recursive: true, force: true });
            }
        }
    });
});
