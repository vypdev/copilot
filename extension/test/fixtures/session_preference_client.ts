import { vi } from 'vitest';
import { backgroundCenterFixture } from './background_center.ts';
import { CONNECTION_INPUT } from './named_sessions.ts';
import { SessionPreferenceClient } from '../../src/application/session_preference_client.ts';
import type { SessionPreferenceRequest } from '../../src/domain/session_preference_request.ts';

/** Actual native background and private transport; deterministic browser ports, not a loaded-browser claim. */
export async function sessionPreferenceClientFixture() {
    const h = backgroundCenterFixture(); const center = await h.client(); await center.connections(CONNECTION_INPUT, 0);
    let canRead = true; let canMutate = true; let now = Date.now();
    const dispatch = (input: SessionPreferenceRequest): Promise<unknown> => center.requestSessionPreferences(input);
    const ports = { request: vi.fn(dispatch), canRead: vi.fn(() => canRead), canMutate: vi.fn(() => canMutate), now: vi.fn(() => now) };
    const client = new SessionPreferenceClient(ports); const listener = vi.fn(); client.subscribe(listener); await client.reader.read();
    vi.mocked(h.sessionArea.set).mockClear(); h.provider.mockClear();
    return { ...h, center, client, ports, dispatch, listener, allowRead: (value: boolean) => { canRead = value; },
        allowMutation: (value: boolean) => { canMutate = value; }, advance: (ms: number) => { now += ms; }, stop: () => { client.stop(); h.stop(); } };
}
