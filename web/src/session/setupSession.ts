import { writable } from 'svelte/store';
import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';

interface SessionState {
  view?: WebSetupView;
  paired: boolean;
  controller: boolean;
  busy: boolean;
  error: string;
}

interface Bootstrap {
  controller: boolean;
  capability?: string;
  takeoverTicket: string;
}

export function createSetupSession(initialSessionKey?: string) {
  const state = writable<SessionState>({ paired: Boolean(initialSessionKey), controller: false, busy: false, error: '' });
  let sessionKey = initialSessionKey;
  let capability: string | undefined;
  let takeoverTicket = '';
  let current: SessionState = { paired: Boolean(initialSessionKey), controller: false, busy: false, error: '' };
  let loading = false;

  function set(patch: Partial<SessionState>): void {
    current = { ...current, ...patch };
    state.set(current);
  }

  async function refresh(preserveError = false): Promise<void> {
    if (loading || !sessionKey) return;
    loading = true;
    try {
      const response = await fetch('/api/state', { cache: 'no-store', headers: { 'X-Setup-Session-Key': sessionKey } } as RequestInit);
      if (!response.ok) throw new Error('The local setup session is unavailable.');
      set({ view: await response.json() as WebSetupView, ...(preserveError ? {} : { error: '' }) });
    } catch {
      set({ view: undefined, error: 'Connection lost. The CLI may have stopped. Check the terminal before trying again.' });
    } finally {
      loading = false;
    }
  }

  async function connect(): Promise<void> {
    if (!sessionKey) return;
    try {
      const response = await fetch('/api/bootstrap', { cache: 'no-store', headers: { 'X-Setup-Session-Key': sessionKey } } as RequestInit);
      if (!response.ok) throw new Error('Could not join this local session.');
      const bootstrap = await response.json() as Bootstrap;
      capability = bootstrap.capability;
      takeoverTicket = bootstrap.takeoverTicket;
      set({ controller: bootstrap.controller, error: '' });
      await refresh();
    } catch {
      sessionKey = undefined;
      capability = undefined;
      takeoverTicket = '';
      set({ view: undefined, paired: false, controller: false, error: 'Could not connect to the local setup session. Check the terminal and pair again.' });
    }
  }

  async function pair(code: string): Promise<void> {
    if (current.busy || current.paired) return;
    set({ busy: true, error: '' });
    try {
      const response = await fetch('/api/pair', {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toLowerCase() }),
      } as RequestInit);
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(data.error ?? 'Pairing was rejected.'));
      if (typeof data.sessionKey !== 'string' || !/^[a-f0-9]{64}$/.test(data.sessionKey)) throw new Error('Invalid local pairing response.');
      sessionKey = data.sessionKey;
      set({ paired: true, error: '' });
      await connect();
    } catch (cause) {
      set({ error: cause instanceof Error ? cause.message : 'Could not pair this browser.' });
    } finally {
      set({ busy: false });
    }
  }

  async function post(path: string, body: Record<string, unknown>, authorized = true): Promise<Record<string, unknown>> {
    const response = await fetch(path, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Setup-Session-Key': sessionKey,
        ...(authorized && capability ? { 'X-Setup-Capability': capability } : {}) },
      body: JSON.stringify(body),
    } as RequestInit);
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(String(data.error ?? 'The request was rejected.'));
    return data;
  }

  async function submit(revision: number, value: string): Promise<void> {
    if (current.busy || !current.controller || current.view?.promptRevision !== revision) return;
    set({ busy: true, error: '' });
    try {
      await post('/api/answer', { revision, value });
      await refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not submit this answer.';
      set({ error: message });
      if (/read-only|Control moved/.test(message)) await connect();
      else await refresh(true);
    } finally {
      set({ busy: false });
    }
  }

  async function cancel(): Promise<void> {
    if (!current.controller || current.busy) return;
    set({ busy: true, error: '' });
    try {
      await post('/api/cancel', {});
      await refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Cancellation failed.';
      set({ error: message });
      if (/read-only|Control moved/.test(message)) await connect();
    } finally {
      set({ busy: false });
    }
  }

  async function takeOver(): Promise<void> {
    try {
      const result = await post('/api/takeover', { ticket: takeoverTicket }, false);
      capability = String(result.capability);
      set({ controller: true, error: '' });
      await refresh();
    } catch (cause) {
      set({ error: cause instanceof Error ? cause.message : 'Takeover failed.' });
      await connect();
    }
  }

  async function close(): Promise<void> {
    try { await post('/api/close', {}); }
    catch { /* The CLI can also be stopped in the terminal. */ }
  }

  return { subscribe: state.subscribe, pair, connect, refresh, submit, cancel, takeOver, close };
}
