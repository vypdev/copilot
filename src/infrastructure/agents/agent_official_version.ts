import { execFileSync } from 'node:child_process';
import type { AgentProvider } from '../../domain/agent';
import { getAgentRuntimeManifestEntry } from './agent_runtime_manifest';
import { trustedCurlPath, trustedSystemPath } from './agent_trusted_system_tools';
import { trustedWindowsSystemRoot } from './windows_system_root.cjs';

const MAX_METADATA_BYTES = 1024 * 1024;
const CODEX_RELEASE_CHANNEL = 'https://releases.openai.com/codex/channels/latest';

function readOfficialText(url: string): string {
    if (!url.startsWith('https://')) throw new Error('Official version source must use HTTPS.');
    const curl = trustedCurlPath();
    const environment: NodeJS.ProcessEnv = {};
    for (const name of ['TEMP', 'TMP', 'TMPDIR', 'PATHEXT', 'COMSPEC', 'OS']) {
        if (process.env[name]) environment[name] = process.env[name];
    }
    environment.PATH = trustedSystemPath();
    if (process.platform === 'win32') {
        environment.SystemRoot = trustedWindowsSystemRoot();
        environment.WINDIR = environment.SystemRoot;
    }
    return execFileSync(curl, [
        '--fail', '--location', '--silent', '--show-error', '--max-time', '15',
        '--proto', '=https', '--proto-redir', '=https', url,
    ], {
        env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 20_000, maxBuffer: MAX_METADATA_BYTES,
    });
}

export function parseOfficialLatestAgentVersion(provider: AgentProvider, metadata: string): string {
    if (!metadata || Buffer.byteLength(metadata, 'utf8') > MAX_METADATA_BYTES) {
        throw new Error('Official version metadata has an invalid size.');
    }
    if (provider === 'cursor') {
        const source = process.platform === 'win32'
            ? /^\$version = '([0-9]{4}\.[0-9]{2}\.[0-9]{2}-[a-f0-9]+)'/mu.exec(metadata)?.[1]
            : /DOWNLOAD_URL="https:\/\/downloads\.cursor\.com\/lab\/([0-9]{4}\.[0-9]{2}\.[0-9]{2}-[a-f0-9]+)\//u.exec(metadata)?.[1];
        if (!source) throw new Error('Official Cursor version metadata is invalid.');
        return source;
    }
    const parsed = JSON.parse(metadata) as { tag_name?: unknown };
    const tag = parsed.tag_name;
    const pattern = provider === 'codex' ? /^rust-v(\d+\.\d+\.\d+)$/u : /^v(\d+\.\d+\.\d+)$/u;
    const version = typeof tag === 'string' ? pattern.exec(tag)?.[1] : undefined;
    if (!version) throw new Error(`Official ${provider} release metadata is invalid.`);
    return version;
}

export function readOfficialLatestAgentVersion(provider: AgentProvider): string {
    const installation = getAgentRuntimeManifestEntry(provider).installation;
    const url = provider === 'codex' ? CODEX_RELEASE_CHANNEL
        : provider === 'opencode' ? installation.windowsReleaseApi
            : process.platform === 'win32' ? installation.windowsScript : installation.unixScript;
    if (!url) throw new Error(`Official ${provider} version source is unavailable.`);
    return parseOfficialLatestAgentVersion(provider, readOfficialText(url));
}

export type OfficialVersionComparison = 'older' | 'current-or-newer' | 'unknown';

export function compareOfficialAgentVersion(
    provider: AgentProvider,
    installedOutput: string,
    latestVersion: string,
): OfficialVersionComparison {
    const installed = installedOutput.trim();
    if (provider === 'cursor') {
        const current = /^([0-9]{4}\.[0-9]{2}\.[0-9]{2})-([a-f0-9]+)$/u.exec(installed);
        const latest = /^([0-9]{4}\.[0-9]{2}\.[0-9]{2})-([a-f0-9]+)$/u.exec(latestVersion);
        if (!current || !latest) return 'unknown';
        if (installed === latestVersion) return 'current-or-newer';
        if (current[1] === latest[1]) return 'unknown';
        return current[1] < latest[1] ? 'older' : 'current-or-newer';
    }
    const current = provider === 'codex'
        ? /^codex-cli (\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u.exec(installed)
        : /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u.exec(installed);
    const latest = (provider === 'codex'
        ? /^(?:codex-cli )?(\d+)\.(\d+)\.(\d+)$/u
        : /^(\d+)\.(\d+)\.(\d+)$/u).exec(latestVersion);
    if (!current || !latest) return 'unknown';
    for (let index = 1; index <= 3; index += 1) {
        const left = Number(current[index]);
        const right = Number(latest[index]);
        if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) return 'unknown';
        if (left !== right) return left < right ? 'older' : 'current-or-newer';
    }
    return current[4] ? 'older' : 'current-or-newer';
}
