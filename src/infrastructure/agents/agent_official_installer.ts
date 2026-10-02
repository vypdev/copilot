import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync,
    readdirSync, realpathSync, rmSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AgentProvider } from '../../domain/agent';
import { getAgentRuntimeManifestEntry } from './agent_runtime_manifest';
import { makeWindowsRuntimePathPrivate } from './windows_runtime_acl';

const MAX_SCRIPT_BYTES = 1_048_576;
const MAX_METADATA_BYTES = 2_097_152;

export interface OfficialAgentInstallation {
    readonly executable: string;
    readonly directory: string;
    readonly root: string;
}

/** No Action inputs, GitHub tokens, provider keys, or user auth stores enter an installer. */
export function installerEnvironment(root: string, source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const allowed = [
        'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'OS', 'COMSPEC',
        'TEMP', 'TMP', 'TMPDIR', 'HOMEDRIVE', 'HOMEPATH', 'SHELL',
    ] as const;
    const environment: NodeJS.ProcessEnv = {};
    for (const name of allowed) {
        if (source[name]) environment[name] = source[name];
    }
    environment.HOME = root;
    environment.USERPROFILE = root;
    environment.LOCALAPPDATA = join(root, 'local');
    environment.XDG_CONFIG_HOME = join(root, '.config');
    environment.CODEX_HOME = join(root, '.codex');
    environment.CODEX_INSTALL_DIR = join(root, 'bin');
    environment.CODEX_NON_INTERACTIVE = '1';
    environment.NO_COLOR = '1';
    return environment;
}

function download(url: string, destination: string, environment: NodeJS.ProcessEnv): void {
    if (!url.startsWith('https://')) throw new Error('Official agent source must use HTTPS.');
    const curl = process.platform === 'win32'
        ? join(environment.SystemRoot || environment.WINDIR || 'C:\\Windows', 'System32', 'curl.exe')
        : 'curl';
    execFileSync(curl, [
        '--fail', '--location', '--silent', '--show-error', '--max-time', '120',
        '--proto', '=https', '--proto-redir', '=https', '--output', destination, url,
    ], { env: environment, stdio: ['ignore', 'ignore', 'pipe'], timeout: 130_000 });
}

function downloadScript(url: string, destination: string, environment: NodeJS.ProcessEnv): string {
    download(url, destination, environment);
    const contents = readFileSync(destination);
    if (contents.length === 0 || contents.length > MAX_SCRIPT_BYTES) {
        throw new Error('Official agent installer size is invalid.');
    }
    return contents.toString('utf8');
}

function runScript(provider: AgentProvider, root: string, environment: NodeJS.ProcessEnv): string {
    const source = getAgentRuntimeManifestEntry(provider).installation;
    const windows = process.platform === 'win32';
    const url = windows ? source.windowsScript : source.unixScript;
    if (!url) throw new Error(`No official ${provider} installer supports this platform.`);
    const script = join(root, windows ? 'install.ps1' : 'install.sh');
    downloadScript(url, script, environment);
    if (windows) {
        const powershell = join(environment.SystemRoot || environment.WINDIR || 'C:\\Windows',
            'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
        execFileSync(powershell, [
            '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
        ], { env: environment, stdio: ['ignore', 'ignore', 'pipe'], timeout: 300_000 });
        return join(root, 'bin', 'codex.exe');
    }
    const shell = provider === 'codex' ? 'sh' : 'bash';
    const args = provider === 'opencode' ? [script, '--no-modify-path'] : [script];
    execFileSync(shell, args, { env: environment, stdio: ['ignore', 'ignore', 'pipe'], timeout: 300_000 });
    return provider === 'codex'
        ? join(root, 'bin', 'codex')
        : provider === 'opencode'
            ? join(root, '.opencode', 'bin', 'opencode')
            : join(root, '.local', 'bin', 'agent');
}

function extractWindowsArchive(archive: string, destination: string, environment: NodeJS.ProcessEnv): void {
    mkdirSync(destination, { recursive: true });
    const quote = (value: string) => value.replace(/'/gu, "''");
    const command = `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath '${quote(archive)}' -DestinationPath '${quote(destination)}' -Force`;
    const powershell = join(environment.SystemRoot || environment.WINDIR || 'C:\\Windows',
        'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    execFileSync(powershell, [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
        Buffer.from(command, 'utf16le').toString('base64'),
    ], { env: environment, stdio: ['ignore', 'ignore', 'pipe'], timeout: 120_000 });
}

export function parseCursorWindowsInstaller(script: string, arch: 'x64' | 'arm64'): string {
    const url = /^\$downloadUrl = '(https:\/\/downloads\.cursor\.com\/lab\/([0-9]{4}\.[0-9]{2}\.[0-9]{2}-[a-f0-9]+)\/)'/mu.exec(script);
    const version = /^\$version = '([^']+)'/mu.exec(script)?.[1];
    if (!url || version !== url[2]) throw new Error('Official Cursor release metadata changed unexpectedly.');
    return `${url[1]}windows/${arch}/agent-cli-package.zip`;
}

function installWindowsCursor(root: string, environment: NodeJS.ProcessEnv): string {
    const source = getAgentRuntimeManifestEntry('cursor').installation.windowsScript;
    if (!source) throw new Error('Official Cursor Windows installer source is absent.');
    const script = downloadScript(source, join(root, 'cursor-install.ps1'), environment);
    const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : undefined;
    if (!arch) throw new Error('Unsupported Cursor Windows architecture.');
    const archive = join(root, 'cursor.zip');
    download(parseCursorWindowsInstaller(script, arch), archive, environment);
    const extracted = join(root, 'extracted');
    extractWindowsArchive(archive, extracted, environment);
    const packageRoot = join(extracted, 'dist-package');
    if (!statSync(join(packageRoot, 'cursor-agent.exe')).isFile()) {
        throw new Error('Official Cursor archive lacks its native executable.');
    }
    const bin = join(root, 'bin');
    cpSync(packageRoot, bin, { recursive: true });
    copyFileSync(join(bin, 'cursor-agent.exe'), join(bin, 'agent.exe'));
    rmSync(archive, { force: true });
    rmSync(extracted, { recursive: true, force: true });
    return join(bin, 'agent.exe');
}

function findFile(directory: string, fileName: string): string | undefined {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isFile() && entry.name.toLowerCase() === fileName) return path;
        if (entry.isDirectory()) {
            const found = findFile(path, fileName);
            if (found) return found;
        }
    }
    return undefined;
}

export function selectOpenCodeWindowsAsset(metadata: {
    tag_name?: string;
    assets?: Array<{ name?: string; browser_download_url?: string; digest?: string | null }>;
}, arch: 'x64' | 'arm64'): { url: string; digest?: string | null } {
    const tag = metadata.tag_name;
    if (!tag || !/^v\d+\.\d+\.\d+$/u.test(tag)) throw new Error('Official OpenCode release tag is invalid.');
    const asset = metadata.assets?.find(candidate => candidate.name === `opencode-windows-${arch}-baseline.zip`)
        || metadata.assets?.find(candidate => candidate.name === `opencode-windows-${arch}.zip`);
    const expectedUrl = `https://github.com/anomalyco/opencode/releases/download/${tag}/${asset?.name}`;
    if (!asset?.name || asset.browser_download_url !== expectedUrl) {
        throw new Error('Official OpenCode release asset is unavailable.');
    }
    return { url: expectedUrl, digest: asset.digest };
}

function installWindowsOpenCode(root: string, environment: NodeJS.ProcessEnv): string {
    const api = getAgentRuntimeManifestEntry('opencode').installation.windowsReleaseApi;
    if (!api) throw new Error('Official OpenCode Windows release source is absent.');
    const metadataFile = join(root, 'opencode-release.json');
    download(api, metadataFile, environment);
    const metadataBytes = readFileSync(metadataFile);
    if (metadataBytes.length === 0 || metadataBytes.length > MAX_METADATA_BYTES) {
        throw new Error('Official OpenCode release metadata size is invalid.');
    }
    const metadata = JSON.parse(metadataBytes.toString('utf8')) as {
        tag_name?: string;
        assets?: Array<{ name?: string; browser_download_url?: string; digest?: string | null }>;
    };
    const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : undefined;
    if (!arch) throw new Error('Unsupported OpenCode Windows architecture.');
    const asset = selectOpenCodeWindowsAsset(metadata, arch);
    const archive = join(root, 'opencode.zip');
    download(asset.url, archive, environment);
    if (asset.digest) {
        const actual = createHash('sha256').update(readFileSync(archive)).digest('hex');
        if (asset.digest !== `sha256:${actual}`) throw new Error('Official OpenCode archive digest mismatch.');
    }
    const extracted = join(root, 'extracted');
    extractWindowsArchive(archive, extracted, environment);
    const source = findFile(extracted, 'opencode.exe');
    if (!source) throw new Error('Official OpenCode archive lacks its native executable.');
    const bin = join(root, 'bin');
    cpSync(dirname(source), bin, { recursive: true });
    rmSync(archive, { force: true });
    rmSync(extracted, { recursive: true, force: true });
    return join(bin, 'opencode.exe');
}

export function installOfficialAgentCli(provider: AgentProvider): OfficialAgentInstallation {
    const root = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'copilot-agent-install-'));
    try {
        chmodSync(root, 0o700);
        makeWindowsRuntimePathPrivate(root, true);
        const environment = installerEnvironment(root, process.env);
        const path = process.platform === 'win32' && provider === 'cursor'
            ? installWindowsCursor(root, environment)
            : process.platform === 'win32' && provider === 'opencode'
                ? installWindowsOpenCode(root, environment)
                : runScript(provider, root, environment);
        const executable = realpathSync(path);
        if (!statSync(executable).isFile()) throw new Error('Official agent installer did not create a file.');
        process.once('exit', () => rmSync(root, { recursive: true, force: true }));
        return { executable, directory: dirname(path), root };
    } catch (error) {
        rmSync(root, { recursive: true, force: true });
        throw error;
    }
}
