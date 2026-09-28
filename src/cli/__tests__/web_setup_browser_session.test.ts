import { createSetupSession } from '../../../web/src/session/setupSession';
import type { WebSetupView } from '../../application/contracts/web_setup_view';

jest.mock('svelte/store', () => ({
  writable: (initial: unknown) => {
    let value = initial;
    const listeners = new Set<(next: unknown) => void>();
    return {
      set(next: unknown) { value = next; for (const listener of listeners) listener(value); },
      subscribe(listener: (next: unknown) => void) { listeners.add(listener); listener(value); return () => listeners.delete(listener); },
    };
  },
}));

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('browser session transport', () => {
  const view: WebSetupView = { revision: 3, promptRevision: 7, repository: 'owner/repo', prompt: { kind: 'secret', title: 'Setup PAT' } };
  const originalFetch = globalThis.fetch;

  afterEach(() => { globalThis.fetch = originalFetch; });

  test('bootstrap and revision-bound submission keep the PAT out of observable state', async () => {
    const requests: Array<{ path: string; options?: RequestInit }> = [];
    globalThis.fetch = jest.fn(async (path: string, options?: RequestInit) => {
      requests.push({ path, options });
      if (path === '/api/bootstrap') return response({ controller: true, capability: 'one-run-capability', takeoverTicket: 'ticket' });
      if (path === '/api/state') return response(view);
      if (path === '/api/answer') return response({ ok: true });
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession();
    let latest = '';
    session.subscribe(state => { latest = JSON.stringify(state); });
    await session.connect();
    await session.submit(7, 'ghp_example_secret');

    expect(requests.map(request => request.path)).toEqual(['/api/bootstrap', '/api/state', '/api/answer', '/api/state']);
    expect(requests[2].options?.headers).toEqual(expect.objectContaining({ 'X-Setup-Capability': 'one-run-capability' }));
    expect(JSON.parse(String(requests[2].options?.body))).toEqual({ revision: 7, value: 'ghp_example_secret' });
    expect(latest).not.toContain('ghp_example_secret');
    await session.submit(6, 'stale');
    expect(requests).toHaveLength(4);
  });

  test('takeover replaces the controller capability and refreshes server-owned state', async () => {
    const requests: Array<{ path: string; options?: RequestInit }> = [];
    globalThis.fetch = jest.fn(async (path: string, options?: RequestInit) => {
      requests.push({ path, options });
      if (path === '/api/bootstrap') return response({ controller: false, takeoverTicket: 'ticket' });
      if (path === '/api/state') return response(view);
      if (path === '/api/takeover') return response({ capability: 'new-capability' });
      if (path === '/api/answer') return response({ ok: true });
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession();
    let controller = false;
    session.subscribe(state => { controller = state.controller; });
    await session.connect();
    await session.submit(7, 'blocked');
    expect(requests.some(request => request.path === '/api/answer')).toBe(false);
    await session.takeOver();
    expect(controller).toBe(true);
    expect(requests.find(request => request.path === '/api/takeover')?.options?.headers).not.toHaveProperty('X-Setup-Capability');
    await session.submit(7, 'allowed');
    expect(requests.find(request => request.path === '/api/answer')?.options?.headers).toEqual(expect.objectContaining({ 'X-Setup-Capability': 'new-capability' }));
  });

  test('a rejected answer refreshes the question while keeping the error visible and the PAT private', async () => {
    const requests: string[] = [];
    globalThis.fetch = jest.fn(async (path: string) => {
      requests.push(path);
      if (path === '/api/bootstrap') return response({ controller: true, capability: 'controller', takeoverTicket: 'ticket' });
      if (path === '/api/state') return response(view);
      if (path === '/api/answer') return response({ error: 'This question changed. Refresh the current state.' }, 409);
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession();
    let latest = '';
    session.subscribe(state => { latest = JSON.stringify(state); });
    await session.connect();
    await session.submit(7, 'ghp_fake_rejected');

    expect(requests).toEqual(['/api/bootstrap', '/api/state', '/api/answer', '/api/state']);
    expect(latest).toContain('This question changed');
    expect(latest).not.toContain('ghp_fake_rejected');
    expect(JSON.parse(latest).busy).toBe(false);
  });

  test('control transfer reconnects as read-only and does not replay an answer', async () => {
    let bootstraps = 0;
    const requests: string[] = [];
    globalThis.fetch = jest.fn(async (path: string) => {
      requests.push(path);
      if (path === '/api/bootstrap') {
        bootstraps += 1;
        return response({ controller: bootstraps === 1, capability: bootstraps === 1 ? 'old' : undefined, takeoverTicket: 'new-ticket' });
      }
      if (path === '/api/state') return response(view);
      if (path === '/api/answer') return response({ error: 'Control moved to another tab.' }, 403);
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession();
    let latest: { controller: boolean; busy: boolean } | undefined;
    session.subscribe(state => { latest = state; });
    await session.connect();
    await session.submit(7, 'fake-token');

    expect(requests.filter(path => path === '/api/answer')).toHaveLength(1);
    expect(bootstraps).toBe(2);
    expect(latest).toMatchObject({ controller: false, busy: false });
  });

  test('a refused cancellation leaves the server-owned journey intact', async () => {
    globalThis.fetch = jest.fn(async (path: string) => {
      if (path === '/api/bootstrap') return response({ controller: true, capability: 'controller', takeoverTicket: 'ticket' });
      if (path === '/api/state') return response(view);
      if (path === '/api/cancel') return response({ error: 'This setup has already started applying or ended.' }, 409);
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession();
    let latest = '';
    session.subscribe(state => { latest = JSON.stringify(state); });
    await session.connect();
    await session.cancel();

    expect(latest).toContain('already started applying');
    expect(JSON.parse(latest)).toMatchObject({ controller: true, busy: false, view });
  });

  test('a failed takeover re-reads the current controller instead of retaining authority', async () => {
    const requests: string[] = [];
    globalThis.fetch = jest.fn(async (path: string) => {
      requests.push(path);
      if (path === '/api/bootstrap') return response({ controller: false, takeoverTicket: 'ticket' });
      if (path === '/api/state') return response(view);
      if (path === '/api/takeover') return response({ error: 'Invalid takeover ticket.' }, 403);
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession();
    let latest: { controller: boolean; busy: boolean } | undefined;
    session.subscribe(state => { latest = state; });
    await session.connect();
    await session.takeOver();

    expect(requests.filter(path => path === '/api/bootstrap')).toHaveLength(2);
    expect(latest).toMatchObject({ controller: false, busy: false });
  });

  test('failed bootstrap and state requests are reported without claiming a live session', async () => {
    globalThis.fetch = jest.fn(async (path: string) => path === '/api/bootstrap'
      ? response({ error: 'Unavailable' }, 503) : response(view)) as typeof fetch;
    const session = createSetupSession();
    let latest = '';
    session.subscribe(state => { latest = JSON.stringify(state); });
    await session.connect();
    expect(latest).toContain('Could not connect');
    expect(JSON.parse(latest).controller).toBe(false);

    globalThis.fetch = jest.fn(async () => response({ error: 'Unavailable' }, 503)) as typeof fetch;
    await session.refresh();
    expect(latest).toContain('Connection lost');
    expect(JSON.parse(latest).view).toBeUndefined();
  });

  test('a failed reconnect drops the old controller capability and cannot replay a PAT', async () => {
    let available = true;
    const requests: string[] = [];
    globalThis.fetch = jest.fn(async (path: string) => {
      requests.push(path);
      if (path === '/api/bootstrap') return available
        ? response({ controller: true, capability: 'old-controller', takeoverTicket: 'ticket' })
        : response({ error: 'Unavailable' }, 503);
      if (path === '/api/state') return response(view);
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession();
    let latest: { controller: boolean; error: string; view?: WebSetupView } | undefined;
    session.subscribe(state => { latest = state; });
    await session.connect();
    expect(latest?.controller).toBe(true);
    available = false;
    await session.connect();
    expect(latest).toMatchObject({ controller: false, error: expect.stringContaining('Could not connect') });
    expect(latest?.view).toBeUndefined();
    await session.submit(7, 'fake-sensitive-pat');
    expect(requests).not.toContain('/api/answer');
  });

  test('control transfer during cancellation reconnects without reporting success', async () => {
    let bootstraps = 0;
    globalThis.fetch = jest.fn(async (path: string) => {
      if (path === '/api/bootstrap') return response({ controller: ++bootstraps === 1, capability: 'old', takeoverTicket: 'ticket' });
      if (path === '/api/state') return response(view);
      if (path === '/api/cancel') return response({ error: 'Control moved to another tab.' }, 403);
      throw new Error('Unexpected route');
    }) as typeof fetch;
    const session = createSetupSession();
    let latest: { controller: boolean; busy: boolean } | undefined;
    session.subscribe(state => { latest = state; });
    await session.connect();
    await session.cancel();
    expect(bootstraps).toBe(2);
    expect(latest).toMatchObject({ controller: false, busy: false });
  });

  test('failure to close the browser session can be handled in the terminal', async () => {
    globalThis.fetch = jest.fn(async () => { throw new Error('CLI stopped'); }) as typeof fetch;
    await expect(createSetupSession().close()).resolves.toBeUndefined();
  });
});
