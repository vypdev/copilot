import { vi } from 'vitest';
import { NamedSessions } from '../../src/application/named_sessions.ts';
import { sessionHarness } from './runtime.ts';
import { centerFixture } from './center.ts';

export const CONNECTION_INPUT = { type: 'connect', name: 'Work', secret: 'synthetic_not_a_real_credential', repository: 'octo/example' } as const;
export function namedSessionsFixture() {
    const h = sessionHarness(); let nextId = 0;
    const ports = { protected: vi.fn(async () => true), identifier: vi.fn(() => `session-${++nextId}`), changed: vi.fn(), connected: vi.fn(async () => undefined) };
    const connections = new NamedSessions(h.port, h.service, ports);
    const center = centerFixture(h.service, connections);
    return { ...h, connections, namedPorts: ports, center, current: vi.fn(() => true) };
}
