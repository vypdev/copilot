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
  const TEST_SESSION_KEY = 'a'.repeat(64);
  const view: WebSetupView = { revision: 3, promptRevision: 7, repository: 'owner/repo', prompt: { kind: 'secret', title: 'Setup PAT' } };
  const originalFetch = globalThis.fetch;

  afterEach(() => { globalThis.fetch = originalFetch; });

  test('starts unpaired, and does not contact the API until terminal pairing', async () => {
    globalThis.fetch = jest.fn() as typeof fetch;
    const session = createSetupSession();
    let state = {} as { paired: boolean };
    session.subscribe(next => { state = next; });
    await session.connect();
    await session.refresh();
    expect(state.paired).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('pairs through same-origin POST and keeps code and key out of observable state', async () => {
    const requests: Array<{ path: string; options?: RequestInit }> = [];
    globalThis.fetch = jest.fn(async (path: string, options?: RequestInit) => {
      requests.push({ path, options });
      if (path === '/api/pair') return response({ sessionKey: TEST_SESSION_KEY });
      if (path === '/api/bootstrap') return response({ controller: true, capability: 'controller', takeoverTicket: 'ticket' });
      if (path === '/api/state') return response(view);
      throw new Error('Unexpected route');
    }) as typeof fetch;
    const session = createSetupSession();
    let latest = '';
    session.subscribe(next => { latest = JSON.stringify(next); });
    await session.pair(' 0123456789ABCDEF ');
    expect(requests.map(request => request.path)).toEqual(['/api/pair', '/api/bootstrap', '/api/state']);
    expect(JSON.parse(String(requests[0].options?.body))).toEqual({ code: '0123456789abcdef' });
    expect(requests[1].options?.headers).toEqual(expect.objectContaining({ 'X-Setup-Session-Key': TEST_SESSION_KEY }));
    expect(latest).toContain('"paired":true');
    expect(latest).not.toContain('0123456789abcdef');
    expect(latest).not.toContain(TEST_SESSION_KEY);
  });

  test('invalid pairing response never enables the setup UI', async () => {
    globalThis.fetch = jest.fn(async () => response({ sessionKey: 'not-a-key' })) as typeof fetch;
    const session = createSetupSession();
    let latest = '';
    session.subscribe(next => { latest = JSON.stringify(next); });
    await session.pair('0123456789abcdef');
    expect(latest).toContain('Invalid local pairing response');
    expect(latest).toContain('"paired":false');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('failed bootstrap after pairing returns to unpaired state', async () => {
    globalThis.fetch = jest.fn(async (path: string) => path === '/api/pair'
      ? response({ sessionKey: TEST_SESSION_KEY }) : response({ error: 'No session' }, 403)) as typeof fetch;
    const session = createSetupSession();
    let latest = '';
    session.subscribe(next => { latest = JSON.stringify(next); });
    await session.pair('0123456789abcdef');
    expect(latest).toContain('"paired":false');
    expect(latest).toContain('pair again');
  });

  test('incorrect code is shown as an error without disclosing the code', async () => {
    globalThis.fetch = jest.fn(async () => response({ error: 'Incorrect pairing code.' }, 403)) as typeof fetch;
    const session = createSetupSession();
    let latest = '';
    session.subscribe(next => { latest = JSON.stringify(next); });
    await session.pair('0123456789abcdef');
    expect(latest).toContain('Incorrect pairing code.');
    expect(latest).toContain('"paired":false');
    expect(latest).not.toContain('0123456789abcdef');
  });

  test('pairing does not run concurrently or repeat after success', async () => {
    let resolvePair!: (value: Response) => void;
    const pendingPair = new Promise<Response>(resolve => { resolvePair = resolve; });
    const requests: string[] = [];
    globalThis.fetch = jest.fn(async (path: string) => {
      requests.push(path);
      if (path === '/api/pair') return pendingPair;
      if (path === '/api/bootstrap') return response({ controller: true, capability: 'controller', takeoverTicket: 'ticket' });
      if (path === '/api/state') return response(view);
      throw new Error('Unexpected route');
    }) as typeof fetch;
    const session = createSetupSession();
    const first = session.pair('0123456789abcdef');
    await session.pair('0123456789abcdef');
    expect(requests).toEqual(['/api/pair']);
    resolvePair(response({ sessionKey: TEST_SESSION_KEY }));
    await first;
    await session.pair('0123456789abcdef');
    expect(requests).toEqual(['/api/pair', '/api/bootstrap', '/api/state']);
  });

  test('pairing failures use a bounded generic message when the server omits one', async () => {
    globalThis.fetch = jest.fn(async () => response({}, 403)) as typeof fetch;
    const session = createSetupSession();
    let latest = '';
    session.subscribe(next => { latest = JSON.stringify(next); });
    await session.pair('0123456789abcdef');
    expect(latest).toContain('Pairing was rejected.');
    expect(latest).toContain('"paired":false');
  });

  test('a non-Error pairing failure stays generic and keeps the page unpaired', async () => {
    globalThis.fetch = jest.fn(async () => { throw 'network unavailable'; }) as typeof fetch;
    const session = createSetupSession();
    let latest = '';
    session.subscribe(next => { latest = JSON.stringify(next); });
    await session.pair('0123456789abcdef');
    expect(latest).toContain('Could not pair this browser.');
    expect(latest).not.toContain('network unavailable');
    expect(latest).toContain('"paired":false');
  });

  test('bootstrap and revision-bound submission keep the PAT out of observable state', async () => {
    const requests: Array<{ path: string; options?: RequestInit }> = [];
    globalThis.fetch = jest.fn(async (path: string, options?: RequestInit) => {
      requests.push({ path, options });
      if (path === '/api/bootstrap') return response({ controller: true, capability: 'one-run-capability', takeoverTicket: 'ticket' });
      if (path === '/api/state') return response(view);
      if (path === '/api/answer') return response({ ok: true });
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession('private-session-key');
    let latest = '';
    session.subscribe(state => { latest = JSON.stringify(state); });
    await session.connect();
    await session.submit(7, 'ghp_example_secret');

    expect(requests.map(request => request.path)).toEqual(['/api/bootstrap', '/api/state', '/api/answer', '/api/state']);
    for (const request of requests) {
      expect(request.options?.headers).toEqual(expect.objectContaining({ 'X-Setup-Session-Key': 'private-session-key' }));
    }
    expect(requests[2].options?.headers).toEqual(expect.objectContaining({ 'X-Setup-Capability': 'one-run-capability' }));
    expect(JSON.parse(String(requests[2].options?.body))).toEqual({ revision: 7, value: 'ghp_example_secret' });
    expect(latest).not.toContain('ghp_example_secret');
    expect(latest).not.toContain('private-session-key');
    await session.submit(6, 'stale');
    expect(requests).toHaveLength(4);
  });

  test('takeover replaces the controller capability and refreshes server-owned state', async () => {
    const requests: Array<{ path: string; options?: RequestInit }> = [];
    globalThis.fetch = jest.fn(async (path: string, options?: RequestInit) => {
      requests.push({ path, options });
      if (path === '/api/bootstrap') return response({ controller: false });
      if (path === '/api/state') return response(view);
      if (path === '/api/takeover') return response({ capability: 'new-capability' });
      if (path === '/api/answer') return response({ ok: true });
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession(TEST_SESSION_KEY);
    let controller = false;
    session.subscribe(state => { controller = state.controller; });
    await session.connect();
    await session.submit(7, 'blocked');
    expect(requests.some(request => request.path === '/api/answer')).toBe(false);
    await session.takeOver(' 0123456789ABCDEF ');
    expect(controller).toBe(true);
    expect(requests.find(request => request.path === '/api/takeover')?.options?.headers).not.toHaveProperty('X-Setup-Capability');
    expect(JSON.parse(String(requests.find(request => request.path === '/api/takeover')?.options?.body))).toEqual({ code: '0123456789abcdef' });
    await session.submit(7, 'allowed');
    expect(requests.find(request => request.path === '/api/answer')?.options?.headers).toEqual(expect.objectContaining({ 'X-Setup-Capability': 'new-capability' }));
  });

  test('takeover cannot start before pairing, from the controller tab, or twice concurrently', async () => {
    const unpaired = createSetupSession();
    globalThis.fetch = jest.fn() as typeof fetch;
    await unpaired.takeOver('0123456789abcdef');
    expect(globalThis.fetch).not.toHaveBeenCalled();

    let releaseTakeover!: (response: Response) => void;
    const pendingTakeover = new Promise<Response>(resolve => { releaseTakeover = resolve; });
    globalThis.fetch = jest.fn(async (path: string) => {
      if (path === '/api/bootstrap') return response({ controller: false });
      if (path === '/api/state') return response(view);
      if (path === '/api/takeover') return pendingTakeover;
      throw new Error('Unexpected route');
    }) as typeof fetch;
    const session = createSetupSession(TEST_SESSION_KEY);
    await session.connect();
    const first = session.takeOver('0123456789abcdef');
    await session.takeOver('0123456789abcdef');
    expect((globalThis.fetch as jest.Mock).mock.calls.filter(([path]) => path === '/api/takeover')).toHaveLength(1);
    releaseTakeover(response({ capability: 'new-controller' }));
    await first;
    await session.takeOver('0123456789abcdef');
    expect((globalThis.fetch as jest.Mock).mock.calls.filter(([path]) => path === '/api/takeover')).toHaveLength(1);
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

    const session = createSetupSession(TEST_SESSION_KEY);
    let latest = '';
    session.subscribe(state => { latest = JSON.stringify(state); });
    await session.connect();
    await session.submit(7, 'ghp_fake_rejected');

    expect(requests).toEqual(['/api/bootstrap', '/api/state', '/api/answer', '/api/state']);
    expect(latest).toContain('This question changed');
    expect(latest).not.toContain('ghp_fake_rejected');
    expect(JSON.parse(latest).busy).toBe(false);
  });

  test('a discovery retry sends only the revision and controller capability, then reads updated state', async () => {
    const requests: Array<{ path: string; options?: RequestInit }> = [];
    globalThis.fetch = jest.fn(async (path: string, options?: RequestInit) => {
      requests.push({ path, options });
      if (path === '/api/bootstrap') return response({ controller: true, capability: 'controller' });
      if (path === '/api/state') return response(view);
      if (path === '/api/retry-discovery') return response({ updated: true });
      throw new Error('Unexpected route');
    }) as typeof fetch;
    const session = createSetupSession(TEST_SESSION_KEY);
    await session.connect();
    await session.retryDiscovery(7);
    expect(requests.map(request => request.path)).toEqual(['/api/bootstrap', '/api/state', '/api/retry-discovery', '/api/state']);
    expect(JSON.parse(String(requests[2].options?.body))).toEqual({ revision: 7 });
    expect(requests[2].options?.headers).toEqual(expect.objectContaining({ 'X-Setup-Capability': 'controller' }));
    await session.retryDiscovery(8);
    expect(requests).toHaveLength(4);
  });

  test('a rejected discovery retry retains the current question and explains the error', async () => {
    const requests: string[] = [];
    globalThis.fetch = jest.fn(async (path: string) => {
      requests.push(path);
      if (path === '/api/bootstrap') return response({ controller: true, capability: 'controller' });
      if (path === '/api/state') return response(view);
      if (path === '/api/retry-discovery') return response({ error: 'Discovery cannot be retried here. Use the manual option.' }, 409);
      throw new Error('Unexpected route');
    }) as typeof fetch;
    const session = createSetupSession(TEST_SESSION_KEY);
    let latest = {} as { error: string; view?: WebSetupView; busy: boolean };
    session.subscribe(state => { latest = state; });
    await session.connect();
    await session.retryDiscovery(7);
    expect(requests).toEqual(['/api/bootstrap', '/api/state', '/api/retry-discovery', '/api/state']);
    expect(latest.error).toContain('manual option');
    expect(latest.view?.promptRevision).toBe(7);
    expect(latest.busy).toBe(false);
  });

  test('controller transfer during a discovery retry reconnects read-only and never replays it', async () => {
    let bootstraps = 0;
    const requests: string[] = [];
    globalThis.fetch = jest.fn(async (path: string) => {
      requests.push(path);
      if (path === '/api/bootstrap') return response({ controller: ++bootstraps === 1, capability: 'controller' });
      if (path === '/api/state') return response(view);
      if (path === '/api/retry-discovery') return response({ error: 'Control moved to another tab.' }, 403);
      throw new Error('Unexpected route');
    }) as typeof fetch;
    const session = createSetupSession(TEST_SESSION_KEY);
    let latest = {} as { controller: boolean; busy: boolean };
    session.subscribe(state => { latest = state; });
    await session.connect();
    await session.retryDiscovery(7);
    expect(requests).toEqual(['/api/bootstrap', '/api/state', '/api/retry-discovery', '/api/bootstrap', '/api/state']);
    expect(latest.controller).toBe(false);
    expect(latest.busy).toBe(false);
  });

  test('a transport exception during discovery retry produces a bounded local error', async () => {
    globalThis.fetch = jest.fn(async (path: string) => {
      if (path === '/api/bootstrap') return response({ controller: true, capability: 'controller' });
      if (path === '/api/state') return response(view);
      if (path === '/api/retry-discovery') throw 'transport unavailable';
      throw new Error('Unexpected route');
    }) as typeof fetch;
    const session = createSetupSession(TEST_SESSION_KEY);
    let latest = {} as { error: string; busy: boolean };
    session.subscribe(state => { latest = state; });
    await session.connect();
    await session.retryDiscovery(7);
    expect(latest.error).toBe('Could not retry discovery.');
    expect(latest.busy).toBe(false);
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

    const session = createSetupSession(TEST_SESSION_KEY);
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

    const session = createSetupSession(TEST_SESSION_KEY);
    let latest = '';
    session.subscribe(state => { latest = JSON.stringify(state); });
    await session.connect();
    await session.cancel();

    expect(latest).toContain('already started applying');
    expect(JSON.parse(latest)).toMatchObject({ controller: true, busy: false, view });
  });

  test('successful cancellation shows the server result and clears the busy indicator', async () => {
    const cancelled: WebSetupView = { revision: 4, repository: 'owner/repo', outcome: 'cancelled' };
    let stateReads = 0;
    globalThis.fetch = jest.fn(async (path: string) => {
      if (path === '/api/bootstrap') return response({ controller: true, capability: 'controller', takeoverTicket: 'ticket' });
      if (path === '/api/state') return response(++stateReads === 1 ? view : cancelled);
      if (path === '/api/cancel') return response({ cancelled: true });
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession(TEST_SESSION_KEY);
    let latest: { busy: boolean; view?: WebSetupView } | undefined;
    session.subscribe(state => { latest = state; });
    await session.connect();
    await session.cancel();
    expect(latest).toMatchObject({ busy: false, view: cancelled });
  });

  test('a server rejection without a message gives a bounded generic error', async () => {
    globalThis.fetch = jest.fn(async (path: string) => {
      if (path === '/api/bootstrap') return response({ controller: true, capability: 'controller', takeoverTicket: 'ticket' });
      if (path === '/api/state') return response(view);
      if (path === '/api/answer') return response({}, 409);
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession(TEST_SESSION_KEY);
    let latest = '';
    session.subscribe(state => { latest = JSON.stringify(state); });
    await session.connect();
    await session.submit(7, 'fake-secret');
    expect(latest).toContain('The request was rejected.');
    expect(latest).not.toContain('fake-secret');
  });

  test('non-Error transport failures still give safe submission and cancellation messages', async () => {
    globalThis.fetch = jest.fn(async (path: string) => {
      if (path === '/api/bootstrap') return response({ controller: true, capability: 'controller', takeoverTicket: 'ticket' });
      if (path === '/api/state') return response(view);
      if (path === '/api/answer' || path === '/api/cancel') throw 'transport unavailable';
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession(TEST_SESSION_KEY);
    let latest = '';
    session.subscribe(state => { latest = JSON.stringify(state); });
    await session.connect();
    await session.submit(7, 'fake-secret');
    expect(latest).toContain('Could not submit this answer.');
    expect(latest).not.toContain('fake-secret');
    await session.cancel();
    expect(latest).toContain('Cancellation failed.');
  });

  test('an unexpected takeover transport failure keeps the tab read-only', async () => {
    let bootstrapReads = 0;
    globalThis.fetch = jest.fn(async (path: string) => {
      if (path === '/api/bootstrap') { bootstrapReads += 1; return response({ controller: false }); }
      if (path === '/api/state') return response(view);
      if (path === '/api/takeover') throw 'transport unavailable';
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession(TEST_SESSION_KEY);
    let controller = true;
    session.subscribe(state => { controller = state.controller; });
    await session.connect();
    await session.takeOver('0123456789abcdef');
    expect(bootstrapReads).toBe(1);
    expect(controller).toBe(false);
  });

  test('a busy submission cannot send a second answer or cancel concurrently', async () => {
    let resolveAnswer: ((value: Response) => void) | undefined;
    const pendingAnswer = new Promise<Response>(resolve => { resolveAnswer = resolve; });
    const requests: string[] = [];
    globalThis.fetch = jest.fn(async (path: string) => {
      requests.push(path);
      if (path === '/api/bootstrap') return response({ controller: true, capability: 'controller', takeoverTicket: 'ticket' });
      if (path === '/api/state') return response(view);
      if (path === '/api/answer') return pendingAnswer;
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession(TEST_SESSION_KEY);
    await session.connect();
    const first = session.submit(7, 'first');
    await session.submit(7, 'duplicate');
    await session.cancel();
    expect(requests.filter(path => path === '/api/answer')).toHaveLength(1);
    expect(requests).not.toContain('/api/cancel');
    resolveAnswer!(response({ accepted: true }));
    await first;
  });

  test('overlapping refresh calls do not race to replace the current view', async () => {
    let resolveState: ((value: Response) => void) | undefined;
    const pendingState = new Promise<Response>(resolve => { resolveState = resolve; });
    const requests: string[] = [];
    globalThis.fetch = jest.fn(async (path: string) => {
      requests.push(path);
      if (path === '/api/state') return pendingState;
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession(TEST_SESSION_KEY);
    const first = session.refresh();
    await session.refresh();
    expect(requests).toEqual(['/api/state']);
    resolveState!(response(view));
    await first;
  });

  test('a failed takeover retains read-only state and explains the rejected code', async () => {
    const requests: string[] = [];
    globalThis.fetch = jest.fn(async (path: string) => {
      requests.push(path);
      if (path === '/api/bootstrap') return response({ controller: false });
      if (path === '/api/state') return response(view);
      if (path === '/api/takeover') return response({ error: 'Incorrect pairing code.' }, 403);
      throw new Error('Unexpected route');
    }) as typeof fetch;

    const session = createSetupSession(TEST_SESSION_KEY);
    let latest: { controller: boolean; busy: boolean; error: string } | undefined;
    session.subscribe(state => { latest = state; });
    await session.connect();
    await session.takeOver('0123456789abcdef');

    expect(requests.filter(path => path === '/api/bootstrap')).toHaveLength(1);
    expect(latest).toMatchObject({ controller: false, busy: false, error: 'Incorrect pairing code.' });
  });

  test('failed bootstrap and state requests are reported without claiming a live session', async () => {
    globalThis.fetch = jest.fn(async (path: string) => path === '/api/bootstrap'
      ? response({ error: 'Unavailable' }, 503) : response(view)) as typeof fetch;
    const session = createSetupSession(TEST_SESSION_KEY);
    let latest = '';
    session.subscribe(state => { latest = JSON.stringify(state); });
    await session.connect();
    expect(latest).toContain('Could not connect');
    expect(JSON.parse(latest).controller).toBe(false);

    globalThis.fetch = jest.fn(async () => response({ error: 'Unavailable' }, 503)) as typeof fetch;
    const stillPaired = createSetupSession(TEST_SESSION_KEY);
    stillPaired.subscribe(state => { latest = JSON.stringify(state); });
    await stillPaired.refresh();
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

    const session = createSetupSession(TEST_SESSION_KEY);
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
    const session = createSetupSession(TEST_SESSION_KEY);
    let latest: { controller: boolean; busy: boolean } | undefined;
    session.subscribe(state => { latest = state; });
    await session.connect();
    await session.cancel();
    expect(bootstraps).toBe(2);
    expect(latest).toMatchObject({ controller: false, busy: false });
  });

  test('failure to close the browser session can be handled in the terminal', async () => {
    globalThis.fetch = jest.fn(async () => { throw new Error('CLI stopped'); }) as typeof fetch;
    await expect(createSetupSession(TEST_SESSION_KEY).close()).resolves.toBeUndefined();
  });

  test('read-only doctor is available only after success to the controller, refreshes redacted results, and cannot run twice concurrently', async () => {
    const complete: WebSetupView = { ...view, outcome: 'complete' };
    let releaseDoctor!: (value: Response) => void;
    const pendingDoctor = new Promise<Response>(resolve => { releaseDoctor = resolve; });
    let currentView = complete;
    const requests: Array<{ path: string; options?: RequestInit }> = [];
    globalThis.fetch = jest.fn(async (path: string, options?: RequestInit) => {
      requests.push({ path, options });
      if (path === '/api/bootstrap') return response({ controller: true, capability: 'doctor-capability' });
      if (path === '/api/state') return response(currentView);
      if (path === '/api/doctor') return pendingDoctor;
      throw new Error('Unexpected route');
    }) as typeof fetch;
    const session = createSetupSession(TEST_SESSION_KEY);
    let latest = {} as { busy: boolean; error: string; view?: WebSetupView };
    session.subscribe(next => { latest = next; });
    await session.runDoctor();
    expect(requests).toHaveLength(0);
    await session.connect();
    const first = session.runDoctor();
    await session.runDoctor();
    expect(requests.filter(request => request.path === '/api/doctor')).toHaveLength(1);
    expect(latest.view?.doctor?.status).toBe('running');
    expect(requests.find(request => request.path === '/api/doctor')?.options?.headers)
      .toEqual(expect.objectContaining({ 'X-Setup-Capability': 'doctor-capability' }));
    currentView = { ...complete, doctor: { status: 'complete', healthy: true, pass: 3, warn: 1, fail: 0, skipped: 2 } };
    releaseDoctor(response({ ok: true }));
    await first;
    expect(latest).toMatchObject({ busy: false, error: '', view: { doctor: { status: 'complete', pass: 3 } } });
  });

  test('doctor failure preserves success, reports the error, and refreshes the failed status', async () => {
    const complete: WebSetupView = { ...view, outcome: 'complete' };
    let currentView = complete;
    globalThis.fetch = jest.fn(async (path: string) => {
      if (path === '/api/bootstrap') return response({ controller: true, capability: 'doctor-capability' });
      if (path === '/api/state') return response(currentView);
      if (path === '/api/doctor') {
        currentView = { ...complete, doctor: { status: 'failed' } };
        return response({ error: 'Read-only diagnosis is unavailable.' }, 503);
      }
      throw new Error('Unexpected route');
    }) as typeof fetch;
    const session = createSetupSession(TEST_SESSION_KEY);
    let latest = {} as { busy: boolean; error: string; view?: WebSetupView };
    session.subscribe(next => { latest = next; });
    await session.connect();
    await session.runDoctor();
    expect(latest).toMatchObject({ busy: false, error: 'Read-only diagnosis is unavailable.', view: { outcome: 'complete', doctor: { status: 'failed' } } });
  });

  test('Back is revision-bound, preserves the server-owned question, and handles stale control safely', async () => {
    let controller = true;
    let failBack = false;
    const previous: WebSetupView = { ...view, promptRevision: 8, prompt: { kind: 'question', title: 'Production branch', phase: 'plan', pass: 1, question: {
      stateId: 'repository', id: 'repository.mainBranch', label: 'Production branch', kind: 'text', defaultValue: 'main',
    } } };
    let currentView = view;
    const paths: string[] = [];
    globalThis.fetch = jest.fn(async (path: string) => {
      paths.push(path);
      if (path === '/api/bootstrap') return response({ controller, ...(controller ? { capability: 'controller-capability' } : {}) });
      if (path === '/api/state') return response(currentView);
      if (path === '/api/back') {
        if (failBack) { controller = false; return response({ error: 'Control moved to another tab.' }, 403); }
        currentView = previous;
        return response({ accepted: true });
      }
      throw new Error('Unexpected route');
    }) as typeof fetch;
    const session = createSetupSession(TEST_SESSION_KEY);
    let latest = {} as { controller: boolean; busy: boolean; view?: WebSetupView };
    session.subscribe(next => { latest = next; });
    await session.back(7);
    expect(paths).toHaveLength(0);
    await session.connect();
    await session.back(6);
    expect(paths).not.toContain('/api/back');
    await session.back(7);
    expect(latest).toMatchObject({ busy: false, view: { promptRevision: 8 } });
    failBack = true;
    await session.back(8);
    expect(latest.controller).toBe(false);
    expect(paths.filter(path => path === '/api/back')).toHaveLength(2);
  });
});
