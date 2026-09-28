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
});
