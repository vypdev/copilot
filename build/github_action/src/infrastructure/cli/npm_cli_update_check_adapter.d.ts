import type { CliUpdateCheckPort } from '../../application/ports/cli_update_check_ports';
export declare const NPM_REGISTRY_URL: string;
export declare const UPDATE_CHECK_CACHE_TTL_MS: number;
export declare const UPDATE_CHECK_TIMEOUT_MS = 1500;
export interface UpdateCheckCacheEntry {
    checkedAt: number;
    latestVersion?: string;
}
export interface CliUpdateCheckCache {
    read(): UpdateCheckCacheEntry | undefined;
    write(entry: UpdateCheckCacheEntry): void;
}
export declare function resolveUpdateCheckCachePath(platform?: NodeJS.Platform, environment?: NodeJS.ProcessEnv, homeDirectory?: string): string;
export declare class FileCliUpdateCheckCache implements CliUpdateCheckCache {
    private readonly filePath;
    constructor(filePath?: string);
    read(): UpdateCheckCacheEntry | undefined;
    write(entry: UpdateCheckCacheEntry): void;
}
export interface NpmCliUpdateCheckAdapterOptions {
    cache?: CliUpdateCheckCache;
    fetcher?: typeof fetch;
    now?: () => number;
    cacheTtlMs?: number;
    timeoutMs?: number;
}
/** Reads npm's latest dist-tag with bounded latency and a non-sensitive local cache. */
export declare class NpmCliUpdateCheckAdapter implements CliUpdateCheckPort {
    private readonly cache;
    private readonly fetcher;
    private readonly now;
    private readonly cacheTtlMs;
    private readonly timeoutMs;
    constructor(options?: NpmCliUpdateCheckAdapterOptions);
    getLatestPublishedVersion(): Promise<string | undefined>;
    private writeCache;
}
