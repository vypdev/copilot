import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    FileCliUpdateCheckCache,
    NPM_REGISTRY_URL,
    NpmCliUpdateCheckAdapter,
    resolveUpdateCheckCachePath,
} from '../npm_cli_update_check_adapter';

class MemoryCache {
    entry: { checkedAt: number; latestVersion?: string } | undefined;

    read() {
        return this.entry;
    }

    write(entry: { checkedAt: number; latestVersion?: string }) {
        this.entry = entry;
    }
}

describe('NpmCliUpdateCheckAdapter', () => {
    it('reads the latest dist-tag from npm and caches it', async () => {
        const cache = new MemoryCache();
        const fetcher = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ 'dist-tags': { latest: '3.4.0' } }),
        });

        await expect(new NpmCliUpdateCheckAdapter({
            cache,
            fetcher,
            now: () => 1000,
        }).getLatestPublishedVersion()).resolves.toBe('3.4.0');

        expect(fetcher).toHaveBeenCalledWith(NPM_REGISTRY_URL, expect.objectContaining({
            headers: { accept: 'application/json' },
            signal: expect.any(AbortSignal),
        }));
        expect(cache.entry).toEqual({ checkedAt: 1000, latestVersion: '3.4.0' });
    });

    it('uses a fresh cache without contacting npm', async () => {
        const cache = new MemoryCache();
        cache.entry = { checkedAt: 1000, latestVersion: '3.4.0' };
        const fetcher = jest.fn();

        await expect(new NpmCliUpdateCheckAdapter({ cache, fetcher, now: () => 1001 }).getLatestPublishedVersion())
            .resolves.toBe('3.4.0');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('fails silently and caches the failed check when npm is unavailable', async () => {
        const cache = new MemoryCache();
        const fetcher = jest.fn().mockRejectedValue(new Error('offline'));

        await expect(new NpmCliUpdateCheckAdapter({ cache, fetcher, now: () => 2000 }).getLatestPublishedVersion())
            .resolves.toBeUndefined();
        expect(cache.entry).toEqual({ checkedAt: 2000 });
    });

    it('does not fail when the cache store itself is unavailable', async () => {
        const fetcher = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ 'dist-tags': { latest: '3.4.0' } }),
        });
        const cache = {
            read: () => { throw new Error('cache read failed'); },
            write: () => { throw new Error('cache write failed'); },
        };

        await expect(new NpmCliUpdateCheckAdapter({ cache, fetcher, now: () => 3000 }).getLatestPublishedVersion())
            .resolves.toBe('3.4.0');
    });

    it('aborts a slow registry request at the configured timeout', async () => {
        const cache = new MemoryCache();
        const fetcher = jest.fn() as jest.MockedFunction<typeof fetch>;
        fetcher.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }));

        await expect(new NpmCliUpdateCheckAdapter({ cache, fetcher, now: () => 4000, timeoutMs: 1 })
            .getLatestPublishedVersion()).resolves.toBeUndefined();
        expect(cache.entry).toEqual({ checkedAt: 4000 });
    });

    it('persists valid cache entries and ignores malformed files', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-update-cache-'));
        const filePath = join(directory, 'nested', 'update-check.json');
        const cache = new FileCliUpdateCheckCache(filePath);

        cache.write({ checkedAt: 5000, latestVersion: '3.4.0' });
        expect(cache.read()).toEqual({ checkedAt: 5000, latestVersion: '3.4.0' });

        writeFileSync(filePath, 'null');
        expect(cache.read()).toBeUndefined();
        writeFileSync(filePath, '{"checkedAt":"invalid"}');
        expect(cache.read()).toBeUndefined();
        writeFileSync(filePath, '{"checkedAt":5000,"latestVersion":42}');
        expect(cache.read()).toEqual({ checkedAt: 5000 });

        rmSync(directory, { recursive: true, force: true });
    });

    it('resolves platform-appropriate cache locations', () => {
        expect(resolveUpdateCheckCachePath('darwin', { XDG_CACHE_HOME: '/tmp/cache' }, '/Users/test'))
            .toBe('/tmp/cache/copilot/update-check.json');
        expect(resolveUpdateCheckCachePath('win32', { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' }, '/Users/test'))
            .toBe('C:\\Users\\test\\AppData\\Local/copilot/update-check.json');
    });
});
