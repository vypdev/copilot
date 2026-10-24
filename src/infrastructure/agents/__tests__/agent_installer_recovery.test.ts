import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as manifest from '../agent_runtime_manifest';
import { installOfficialAgentCli, OfficialAgentInstallationError } from '../agent_official_installer';
import { trustedCurlPath, trustedSystemPath } from '../agent_trusted_system_tools';

jest.mock('node:child_process', () => ({ execFileSync: jest.fn() }));
jest.mock('../windows_runtime_acl', () => ({
    makeWindowsRuntimePathPrivate: jest.fn(), verifyWindowsAgentExecutableAcl: jest.fn(),
}));
const execute = execFileSync as jest.Mock;
const windows = process.platform === 'win32';
const entry = manifest.getAgentRuntimeManifestEntry('codex');
const primary = windows ? entry.installation.windowsScript! : entry.installation.unixScript;
const source = entry.installation.scriptRecovery![windows ? 'windows' : 'unix'];
const payload = Buffer.from('# reviewed official installer fixture\n');
const digest = createHash('sha256').update(payload).digest('hex');

function recoverySource(overrides: Partial<typeof source> = {}): void {
    jest.spyOn(manifest, 'getAgentRuntimeManifestEntry').mockReturnValue({
        ...entry,
        installation: {
            ...entry.installation,
            scriptRecovery: {
                unix: { ...entry.installation.scriptRecovery!.unix, sha256: digest, ...overrides },
                windows: { ...entry.installation.scriptRecovery!.windows, sha256: digest, ...overrides },
            },
        },
    });
}

beforeEach(() => execute.mockReset());
afterEach(() => jest.restoreAllMocks());

describe('bounded official Codex installer recovery', () => {
    it('recovers a failed primary transfer with a verified official script and isolated native install', () => {
        recoverySource();
        execute.mockImplementation((file: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
            if (file === trustedCurlPath()) {
                if (args.at(-1) === primary) throw Object.assign(new Error('private network detail'), { status: 22 });
                expect(args.at(-1)).toBe(source.url);
                expect(args).toEqual(expect.arrayContaining([
                    '--max-time', '120', '--max-filesize', '1048576', '--proto', '=https', '--proto-redir', '=https',
                ]));
                expect(options).toMatchObject({ timeout: 130_000, maxBuffer: 1_048_577 });
                expect(options.env.PATH).toBe(trustedSystemPath());
                for (const key of ['GITHUB_TOKEN', 'PAT', 'CODEX_API_KEY', 'OPENAI_API_KEY', 'CODEX_RELEASE']) {
                    expect(options.env[key]).toBeUndefined();
                }
                return payload;
            }
            expect(readFileSync(args.at(-1)!)).toEqual(payload);
            const executable = join(options.env.CODEX_INSTALL_DIR!, windows ? 'codex.exe' : 'codex');
            mkdirSync(dirname(executable), { recursive: true });
            writeFileSync(executable, 'private native fixture');
            chmodSync(executable, 0o755);
            return Buffer.alloc(0);
        });
        const installed = installOfficialAgentCli('codex');
        try {
            expect(existsSync(installed.executable)).toBe(true);
            expect(execute).toHaveBeenCalledTimes(3);
            expect(execute.mock.calls.map(([, args]) => args.at(-1)).slice(0, 2)).toEqual([primary, source.url]);
        } finally {
            rmSync(installed.root, { recursive: true, force: true });
        }
    });

    it('rejects different script bytes before any shell runs and removes the private root', () => {
        recoverySource();
        let root = '';
        execute.mockImplementation((_file: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
            root = options.env.HOME!;
            if (args.at(-1) === primary) throw Object.assign(new Error('private HTTP detail'), { status: 22 });
            return Buffer.from('substituted script');
        });
        expect(() => installOfficialAgentCli('codex')).toThrow(expect.objectContaining({ stage: 'download', reason: 'checksum' }));
        expect(execute).toHaveBeenCalledTimes(2);
        expect(existsSync(root)).toBe(false);
    });

    it.each([
        ['second transfer fails', undefined],
        ['second transfer is empty', Buffer.alloc(0)],
        ['second transfer exceeds the byte bound', Buffer.alloc(1_048_577)],
    ])('fails closed when the %s without another retry', (_name, contents) => {
        recoverySource();
        let root = '';
        execute.mockImplementation((_file: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
            root = options.env.HOME!;
            if (args.at(-1) === primary || contents === undefined) {
                throw Object.assign(new Error('secret-bearing network output'), { status: 22 });
            }
            return contents;
        });
        try {
            installOfficialAgentCli('codex');
            throw new Error('Expected transfer failure.');
        } catch (error) {
            expect(error).toBeInstanceOf(OfficialAgentInstallationError);
            expect(error).toMatchObject({ stage: 'download' });
            expect((error as Error).message).not.toContain('secret-bearing');
        }
        expect(execute).toHaveBeenCalledTimes(2);
        expect(existsSync(root)).toBe(false);
    });

    it.each([
        { url: source.url.replace('raw.githubusercontent.com', 'attacker.invalid') },
        { url: source.url.replace('b412ff32c417f855c2b2d1581b77058eed87c84b', 'main') },
        { url: source.url.replace('openai/codex', 'another/codex') },
        { url: source.url.replace(windows ? '.ps1' : '.sh', windows ? '.sh' : '.ps1') },
        { sha256: 'unchecked' },
    ])('rejects unreviewed recovery metadata %# before requesting it', overrides => {
        recoverySource(overrides);
        execute.mockImplementation(() => { throw Object.assign(new Error('HTTP failure'), { status: 22 }); });
        expect(() => installOfficialAgentCli('codex')).toThrow(expect.objectContaining({ reason: 'recovery-source' }));
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('does not use recovery when a downloaded primary script fails during execution', () => {
        execute.mockImplementation((file: string) => {
            if (file === trustedCurlPath()) return payload;
            throw Object.assign(new Error('private installer stderr'), { status: 1 });
        });
        expect(() => installOfficialAgentCli('codex')).toThrow(expect.objectContaining({ stage: 'installer-script' }));
        expect(execute).toHaveBeenCalledTimes(2);
    });

    it.each(['cursor', 'opencode'] as const)('never adds recovery downloads to %s', provider => {
        execute.mockImplementation(() => { throw Object.assign(new Error('HTTP failure'), { status: 22 }); });
        expect(() => installOfficialAgentCli(provider)).toThrow(expect.objectContaining({ stage: 'download' }));
        expect(execute).toHaveBeenCalledTimes(1);
    });
});
