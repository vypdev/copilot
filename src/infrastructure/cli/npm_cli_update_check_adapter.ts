import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CliUpdateCheckPort } from '../../application/ports/cli_update_check_ports';
import { COPILOT_PACKAGE_NAME } from './npm_cli_upgrade_adapter';

export const NPM_REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(COPILOT_PACKAGE_NAME)}`;
export const UPDATE_CHECK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const UPDATE_CHECK_TIMEOUT_MS = 1500;

export interface UpdateCheckCacheEntry {
    checkedAt: number;
    latestVersion?: string;
}

export interface CliUpdateCheckCache {
    read(): UpdateCheckCacheEntry | undefined;
    write(entry: UpdateCheckCacheEntry): void;
}

export function resolveUpdateCheckCachePath(
    platform: NodeJS.Platform = process.platform,
    environment: NodeJS.ProcessEnv = process.env,
    homeDirectory: string = homedir(),
): string {
    const cacheRoot = platform === 'win32'
        ? environment.LOCALAPPDATA || join(homeDirectory, 'AppData', 'Local')
        : environment.XDG_CACHE_HOME || join(homeDirectory, '.cache');
    return join(cacheRoot, 'copilot', 'update-check.json');
}

export class FileCliUpdateCheckCache implements CliUpdateCheckCache {
    constructor(private readonly filePath: string = resolveUpdateCheckCachePath()) {}

    read(): UpdateCheckCacheEntry | undefined {
        try {
            const value: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
            if (!value || typeof value !== 'object') return undefined;
            const entry = value as Record<string, unknown>;
            if (typeof entry.checkedAt !== 'number' || !Number.isFinite(entry.checkedAt)) return undefined;
            return {
                checkedAt: entry.checkedAt,
                ...(typeof entry.latestVersion === 'string' ? { latestVersion: entry.latestVersion } : {}),
            };
        } catch {
            return undefined;
        }
    }

    write(entry: UpdateCheckCacheEntry): void {
        try {
            mkdirSync(dirname(this.filePath), { recursive: true });
            writeFileSync(this.filePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
        } catch {
            // A cache failure must not affect the CLI command.
        }
    }
}

interface NpmRegistryPackageMetadata {
    'dist-tags'?: {
        latest?: unknown;
    };
}

export interface NpmCliUpdateCheckAdapterOptions {
    cache?: CliUpdateCheckCache;
    fetcher?: typeof fetch;
    now?: () => number;
    cacheTtlMs?: number;
    timeoutMs?: number;
}

/** Reads npm's latest dist-tag with bounded latency and a non-sensitive local cache. */
export class NpmCliUpdateCheckAdapter implements CliUpdateCheckPort {
    private readonly cache: CliUpdateCheckCache;
    private readonly fetcher: typeof fetch;
    private readonly now: () => number;
    private readonly cacheTtlMs: number;
    private readonly timeoutMs: number;

    constructor(options: NpmCliUpdateCheckAdapterOptions = {}) {
        this.cache = options.cache ?? new FileCliUpdateCheckCache();
        this.fetcher = options.fetcher ?? fetch;
        this.now = options.now ?? Date.now;
        this.cacheTtlMs = options.cacheTtlMs ?? UPDATE_CHECK_CACHE_TTL_MS;
        this.timeoutMs = options.timeoutMs ?? UPDATE_CHECK_TIMEOUT_MS;
    }

    async getLatestPublishedVersion(): Promise<string | undefined> {
        const checkedAt = this.now();
        let cached: UpdateCheckCacheEntry | undefined;
        try {
            cached = this.cache.read();
        } catch {
            cached = undefined;
        }
        if (cached && checkedAt >= cached.checkedAt && checkedAt - cached.checkedAt < this.cacheTtlMs) {
            return cached.latestVersion;
        }

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
            try {
                const response = await this.fetcher(NPM_REGISTRY_URL, {
                    headers: { accept: 'application/json' },
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status}`);
                const payload = await response.json() as NpmRegistryPackageMetadata;
                const latestVersion = typeof payload['dist-tags']?.latest === 'string'
                    ? payload['dist-tags'].latest
                    : undefined;
                this.writeCache({ checkedAt, ...(latestVersion ? { latestVersion } : {}) });
                return latestVersion;
            } finally {
                clearTimeout(timeout);
            }
        } catch {
            this.writeCache({ checkedAt });
            return undefined;
        }
    }

    private writeCache(entry: UpdateCheckCacheEntry): void {
        try {
            this.cache.write(entry);
        } catch {
            // A cache failure must not affect the CLI command.
        }
    }
}
