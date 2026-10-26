import { decodeRead, validRead, type ReadRequest } from '../../domain/read.ts';
import type { GitHubReadPort, ReadCancellation, ReadResult } from '../../application/read_ports.ts';

/** This port accepts semantic operations, never caller URLs, methods, bodies, or headers. */
export class GitHubGetReader implements GitHubReadPort {
    constructor(private readonly request: typeof fetch = fetch) {}
    async read(operation: ReadRequest, secret: string, cancellation: ReadCancellation, etag = ''): Promise<ReadResult> {
        if (!validRead(operation)) return { state: 'invalid', bytes: 0 };
        if (cancellation.aborted) return { state: 'aborted', bytes: 0 };
        const path = operation.type === 'viewer' ? '/user' : operation.type === 'repository' ? `/repos/${operation.name}`
            : `/repos/${operation.repository}/${operation.kind === 'issue' ? 'issues' : 'pulls'}/${operation.number}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        const release = cancellation.onAbort(() => controller.abort());
        try {
            const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
            if (secret) headers.Authorization = `Bearer ${secret}`;
            if (etag) headers['If-None-Match'] = etag;
            const response = await this.request(`https://api.github.com${path}`, { method: 'GET', headers,
                credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal });
            if (response.redirected || response.url !== `https://api.github.com${path}`) return { state: 'invalid', bytes: 0 };
            if (cancellation.aborted) return { state: 'aborted', bytes: 0 };
            if (response.status === 304) return { state: 'unchanged', bytes: 0 };
            if (response.status === 401) return { state: 'unauthorized', bytes: 0 };
            if ([429, 503].includes(response.status) || (response.status === 403
                && (response.headers.has('retry-after') || response.headers.get('x-ratelimit-remaining') === '0'))) {
                const retry = Number(response.headers.get('retry-after'));
                const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000 - Date.now();
                return { state: 'limited', retryAfter: Math.max(Number.isFinite(retry) ? retry : 0, reset / 1000), bytes: 0 };
            }
            if ([403, 404].includes(response.status)) return { state: 'denied', bytes: 0 };
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || !response.body) return { state: 'invalid', bytes: 0 };
            const stream = response.body.getReader();
            const chunks: Uint8Array[] = []; let bytes = 0;
            try {
                while (true) {
                    const chunk = await stream.read();
                    if (chunk.done) break;
                    bytes += chunk.value.byteLength;
                    if (bytes > 1024 * 1024) { await stream.cancel(); return { state: 'partial', bytes: 0 }; }
                    chunks.push(chunk.value);
                }
            } finally { stream.releaseLock(); }
            if (cancellation.aborted) return { state: 'aborted', bytes: 0 };
            const joined = new Uint8Array(bytes); let offset = 0;
            for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
            let decoded: unknown;
            try { decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)); }
            catch { return { state: 'invalid', bytes: 0 }; }
            const data = decodeRead(operation, decoded);
            if (!data) return { state: 'invalid', bytes: 0 };
            const tag = response.headers.get('etag') ?? '';
            return { state: 'ok', data, bytes, etag: tag.length <= 256 ? tag : '' };
        } catch { return { state: cancellation.aborted ? 'aborted' : 'offline', bytes: 0 }; }
        finally { clearTimeout(timeout); controller.abort(); release(); }
    }
}
