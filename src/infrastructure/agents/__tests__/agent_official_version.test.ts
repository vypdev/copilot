import { execFileSync } from 'node:child_process';
import {
    compareOfficialAgentVersion, parseOfficialLatestAgentVersion, readOfficialLatestAgentVersion,
} from '../agent_official_version';

jest.mock('node:child_process', () => ({ execFileSync: jest.fn() }));
const execute = execFileSync as jest.Mock;

describe('official agent version discovery', () => {
    beforeEach(() => execute.mockReset());

    it.each([
        ['codex', '{"tag_name":"rust-v0.159.2"}', '0.159.2'],
        ['opencode', '{"tag_name":"v1.18.3"}', '1.18.3'],
    ] as const)('reads the stable %s official release tag', (provider, metadata, expected) => {
        expect(parseOfficialLatestAgentVersion(provider, metadata)).toBe(expected);
        expect(() => parseOfficialLatestAgentVersion(provider, metadata.replace('tag_name', 'other'))).toThrow();
    });

    it('reads only an official Cursor installer version', () => {
        const version = '2026.10.01-e373342';
        const metadata = process.platform === 'win32'
            ? `$version = '${version}'`
            : `DOWNLOAD_URL="https://downloads.cursor.com/lab/${version}/darwin/x64/agent-cli-package.tar.gz"`;
        expect(parseOfficialLatestAgentVersion('cursor', metadata)).toBe(version);
        expect(() => parseOfficialLatestAgentVersion('cursor', metadata.replace('downloads.cursor.com', 'example.invalid')
            .replace('$version', '$other'))).toThrow();
    });

    it('fetches only fixed official HTTPS metadata with no credential environment', () => {
        execute.mockReturnValue('{"tag_name":"rust-v0.159.2"}');
        expect(readOfficialLatestAgentVersion('codex')).toBe('0.159.2');
        const [command, args, options] = execute.mock.calls[0];
        expect(command).toContain('curl');
        expect(args.at(-1)).toBe('https://releases.openai.com/codex/channels/latest');
        expect(options.env.CODEX_API_KEY).toBeUndefined();
        expect(options.env.GITHUB_TOKEN).toBeUndefined();
        expect(options.timeout).toBe(20_000);
    });

    it.each([
        ['codex', 'codex-cli 0.149.1', '0.159.2', 'older'],
        ['codex', 'codex-cli 0.159.2', '0.159.2', 'current-or-newer'],
        ['codex', 'codex-cli 0.160.0-alpha.1', '0.159.2', 'current-or-newer'],
        ['opencode', '1.18.2', '1.18.3', 'older'],
        ['cursor', '2026.09.10-fd3934a', '2026.10.01-e373342', 'older'],
        ['cursor', '2026.10.01-fd3934a', '2026.10.01-e373342', 'unknown'],
        ['cursor', 'invalid', '2026.10.01-e373342', 'unknown'],
    ] as const)('compares %s %s to %s as %s', (provider, installed, latest, expected) => {
        expect(compareOfficialAgentVersion(provider, installed, latest)).toBe(expected);
    });
});
