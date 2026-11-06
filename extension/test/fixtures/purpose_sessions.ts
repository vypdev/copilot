import { vi } from 'vitest';
import { NamedSessions, NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { PurposeIdentityVerifier } from '../../src/application/purpose_identity_verifier.ts';
import type { WritePurpose } from '../../src/domain/credential_roles.ts';
import { centerFixture } from './center.ts';
import { sessionHarness } from './runtime.ts';
import { CONNECTION_INPUT } from './named_sessions.ts';
import { purposeEntry } from './credential_roles.ts';

export function purposeSessionsFixture() {
    const h = sessionHarness(); let identifier = 0; const verifier = new PurposeIdentityVerifier(h.scheduler, h.ports);
    const namedPorts = { protected: vi.fn(async () => true), identifier: vi.fn(() => `session-${++identifier}`), changed: vi.fn(), connected: vi.fn(async () => undefined) };
    const connections = new NamedSessions(h.port, h.service, namedPorts, verifier); const current = vi.fn(() => true); const center = centerFixture(h.service, connections);
    const adding = (purpose: WritePurpose, name: string = purpose) => ({ type: 'connect-role' as const, purpose, name, repository: 'octo/example', secret: purposeEntry(purpose).connection.secret });
    return { ...h, verifier, connections, namedPorts, current, center, adding,
        read: () => connections.read(current), addRead: () => connections.change(CONNECTION_INPUT, 0, current),
        add: (purpose: WritePurpose, revision: number, name?: string) => connections.change(adding(purpose, name), revision, current),
        writes: () => vi.mocked(h.port.set).mock.calls.filter(([key]) => key === NAMED_SESSIONS_KEY),
        resetCalls: () => { vi.mocked(h.port.set).mockClear(); vi.mocked(h.port.remove).mockClear(); vi.mocked(h.reader.read).mockClear(); namedPorts.connected.mockClear(); namedPorts.changed.mockClear(); } };
}
