import { afterEach, expect, it, vi } from 'vitest';
import { GitHubGetReader } from '../../src/adapters/github/get_reader.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { decodeRead, validRead, type ReadRequest } from '../../src/domain/read.ts';

const request: ReadRequest = { type: 'object', repository: 'octo/example', kind: 'issue', number: 42 };
const data = { number: 42, html_url: 'https://github.com/octo/example/issues/42', title: '<script>fixture</script>', state: 'open' };
function response(body: BodyInit | null = JSON.stringify(data), status = 200, headers: HeadersInit = { 'content-type': 'application/json' }, url = 'https://api.github.com/repos/octo/example/issues/42') {
    const result = new Response(body, { status, headers }); Object.defineProperty(result, 'url', { value: url }); return result;
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('github-browser-extension-runtime-C20 exposes only approved semantic GET operations, no arbitrary method/body/URL authority', async () => {
    const send = vi.fn(async () => response()); const reader = new GitHubGetReader(send as typeof fetch);
    const result = await reader.read(request, 'synthetic_credential', new BrowserCancellation());
    expect(result.state).toBe('ok'); expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual(['https://api.github.com/repos/octo/example/issues/42', expect.objectContaining({ method: 'GET',
        credentials: 'omit', redirect: 'error', cache: 'no-store', headers: expect.objectContaining({ Authorization: 'Bearer synthetic_credential' }) })]);
    for (const invalid of [null, {}, { type: 'fetch', url: 'https://evil.invalid' }, { ...request, method: 'POST' },
        { ...request, body: 'anything' }, { ...request, repository: '../example' }, { ...request, repository: 'octo/..' },
        { ...request, repository: 1 }, { ...request, repository: 'a'.repeat(202) }, { ...request, repository: 'bad' },
        { ...request, number: 0 }, { ...request, number: 10000000000 }, { ...request, kind: 'commit' }, { type: 'viewer', secret: 'no' },
        { type: 'repository', name: 'octo/example', extra: 1 }]) {
        expect(validRead(invalid)).toBe(false); expect((await reader.read(invalid as ReadRequest, '', new BrowserCancellation())).state).toBe('invalid');
    }
    expect(send).toHaveBeenCalledTimes(1);
});
it('github-browser-extension-runtime-C21 maps viewer, repository, issue and PR shapes with exact canonical identity and no raw response leakage', async () => {
    expect(decodeRead({ type: 'viewer' }, { id: 1, login: 'octo', arbitraryPrivate: 'excluded' })).toEqual({ id: '1', login: 'octo' });
    for (const item of [null, {}, { id: 0, login: 'octo' }, { id: 1, login: 1 }, { id: 1, login: '<html>' }]) expect(decodeRead({ type: 'viewer' }, item)).toBe(null);
    const repository = { type: 'repository', name: 'octo/example' } as const;
    expect(decodeRead(repository, { id: 7, full_name: 'Octo/Example' })).toEqual({ id: '7', name: 'Octo/Example' });
    for (const item of [{ id: 0, full_name: 'octo/example' }, { id: 7, full_name: 1 }, { id: 7, full_name: 'other/repo' }]) expect(decodeRead(repository, item)).toBe(null);
    for (const patch of [{ number: 43 }, { html_url: 'https://evil.invalid' }, { title: 1 }, { title: 'x'.repeat(501) }, { state: 'merged' }, { pull_request: {} }]) expect(decodeRead(request, { ...data, ...patch })).toBe(null);
    const pull = { ...request, kind: 'pull' } as const;
    expect(decodeRead(pull, { ...data, html_url: 'https://github.com/octo/example/pull/42' })).toBe(null);
    expect(decodeRead(pull, { ...data, head: {}, state: 'closed', html_url: 'https://github.com/octo/example/pull/42' })).toMatchObject({ kind: 'pull', state: 'closed' });
    const send = vi.fn(async (url: string) => response(JSON.stringify(url.endsWith('/user') ? { id: 1, login: 'octo' } : url.endsWith('/pulls/42')
        ? { ...data, head: {}, html_url: 'https://github.com/octo/example/pull/42' } : { id: 7, full_name: 'octo/example' }), 200, { 'content-type': 'application/json' }, url));
    const reader = new GitHubGetReader(send as typeof fetch);
    for (const operation of [{ type: 'viewer' }, repository, pull] as ReadRequest[]) expect((await reader.read(operation, '', new BrowserCancellation(), 'known-etag')).state).toBe('ok');
    expect(send.mock.calls[0][0]).toBe('https://api.github.com/user');
});
it('github-browser-extension-runtime-C21 denies redirects and malformed status/content/UTF-8/JSON/identity before returning data', async () => {
    const redirected = response(); Object.defineProperty(redirected, 'redirected', { value: true });
    for (const reply of [redirected, response(null, 200, {}, 'https://evil.invalid/'), response(null, 500), response('{}', 200, {}),
        response(null), response('{malformed'), response(new Uint8Array([0xff])), response('{}')]) {
        const reader = new GitHubGetReader(vi.fn(async () => reply) as typeof fetch);
        expect((await reader.read(request, '', new BrowserCancellation())).state).toBe('invalid');
    }
});
it('github-browser-extension-runtime-C16 maps 401, 403, masked 404, 429, 503 and provider retry/rate-reset facts into closed states', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(100000);
    for (const [status, headers, expected] of [[401, {}, 'unauthorized'], [403, {}, 'denied'], [404, {}, 'denied'],
        [429, { 'retry-after': '120' }, 'limited'], [503, { 'retry-after': 'invalid' }, 'limited'],
        [503, { 'retry-after': new Date(220000).toUTCString() }, 'limited'],
        [403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '500' }, 'limited']] as const) {
        const result = await new GitHubGetReader(vi.fn(async () => response(null, status, headers)) as typeof fetch).read(request, '', new BrowserCancellation());
        expect(result.state).toBe(expected);
        if (status === 503 && headers['retry-after'] !== 'invalid') expect(result).toMatchObject({ retryAfter: 120 });
        if (status === 429) expect(result).toMatchObject({ retryAfter: 120 });
        if (status === 403 && expected === 'limited') expect(result).toMatchObject({ retryAfter: 400 });
    }
});
it('github-browser-extension-runtime-C23 enforces decoded response byte cap and cancellation before/during/after transport without keeping timers alive', async () => {
    const owner = new BrowserCancellation(); owner.abort(); const send = vi.fn(); const reader = new GitHubGetReader(send);
    expect((await reader.read(request, '', owner)).state).toBe('aborted'); expect(send).not.toHaveBeenCalled();
    const cancel = vi.fn(); const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); }, cancel });
    const oversized = new GitHubGetReader(vi.fn(async () => response(stream)) as typeof fetch);
    expect((await oversized.read(request, '', new BrowserCancellation())).state).toBe('partial'); expect(cancel).toHaveBeenCalledTimes(1);
    for (const phase of ['fetch', 'body', 'reject']) {
        const cancellation = new BrowserCancellation();
        const transport = vi.fn(async () => {
            if (phase === 'fetch') cancellation.abort();
            if (phase === 'reject') { cancellation.abort(); throw new Error('secret'); }
            return phase === 'body' ? response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(data))); cancellation.abort(); controller.close(); } })) : response();
        });
        expect((await new GitHubGetReader(transport as typeof fetch).read(request, '', cancellation)).state).toBe('aborted');
    }
    expect((await new GitHubGetReader(vi.fn(async () => { throw new Error('secret'); }) as typeof fetch).read(request, '', new BrowserCancellation())).state).toBe('offline');
});
it('honors ETag revalidation, bounds provider ETags, and cancels a stalled transport after its scoped deadline', async () => {
    const unchanged = new GitHubGetReader(vi.fn(async () => response(null, 304)) as typeof fetch);
    expect((await unchanged.read(request, '', new BrowserCancellation())).state).toBe('unchanged');
    for (const etag of ['normal', 'x'.repeat(257)]) {
        const result = await new GitHubGetReader(vi.fn(async () => response(JSON.stringify(data), 200,
            { 'content-type': 'application/json', etag })) as typeof fetch).read(request, '', new BrowserCancellation());
        expect(result).toMatchObject({ etag: etag.length > 256 ? '' : etag });
    }
    vi.useFakeTimers(); const transport = vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => options!.signal!.addEventListener('abort', () => reject(new Error('timeout')))));
    const operation = new GitHubGetReader(transport as typeof fetch).read(request, '', new BrowserCancellation());
    await vi.advanceTimersByTimeAsync(20000); expect((await operation).state).toBe('offline'); expect(vi.getTimerCount()).toBe(0);
});

it('a provider stream failure discards accumulated bytes, releases the reader lock and returns no partial private object', async () => {
    let reads = 0; const body = new ReadableStream({ pull(controller) {
        if (reads++ === 0) controller.enqueue(new TextEncoder().encode('{"private":'));
        else controller.error(new Error('synthetic-private-error'));
    } });
    const result = await new GitHubGetReader(vi.fn(async () => response(body)) as typeof fetch).read(request, '', new BrowserCancellation());
    expect(result).toEqual({ state: 'offline', bytes: 0 }); expect(body.locked).toBe(false);
});

it('cancellation as the last body chunk drains rejects the complete object before decoding or projection', async () => {
    const owner = new BrowserCancellation(); let reads = 0;
    const body = new ReadableStream({ pull(controller) {
        if (reads++ === 0) controller.enqueue(new TextEncoder().encode(JSON.stringify(data)));
        else { owner.abort(); controller.close(); }
    } }, { highWaterMark: 0 });
    const result = await new GitHubGetReader(vi.fn(async () => response(body)) as typeof fetch).read(request, '', owner);
    expect(result).toEqual({ state: 'aborted', bytes: 0 }); expect(body.locked).toBe(false);
});
