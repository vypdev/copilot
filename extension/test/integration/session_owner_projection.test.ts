import { expect, it, vi } from 'vitest';
import { namedSessionsFixture } from '../fixtures/named_sessions.ts';
import { CONNECTED } from '../fixtures/runtime.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { centerProfileResolution } from '../../src/domain/profile_context.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
it.each(['99', undefined])('projects fresh verified owner facts after restore instead of applying stale organization scope (%s)', async organizationId => {
    const h = namedSessionsFixture(); const stored = { ...CONNECTED, organizationId: '55' };
    h.values.set(SESSION_KEY, stored); h.values.set(NAMED_SESSIONS_KEY, { schemaVersion: 1, revision: 3, selected: 'work', entries: [{ id: 'work', name: 'Work', host: 'github.com', role: 'repository-read', connection: stored }] });
    vi.mocked(h.reader.read).mockImplementation(async request => ({ state: 'ok', etag: '', bytes: 12,
        data: request.type === 'viewer' ? { id: '1', login: 'octo' } : { id: '7', name: 'octo/example', ...(organizationId === undefined ? {} : { organizationId }) } }));
    const result = await h.connections.read(h.current); expect(result).toMatchObject({ state: 'ready', connected: true });
    if (result.state !== 'ready') throw new Error('expected-readable-projection');
    expect(result.entries[0].organizationId).toBe(organizationId);
    expect((h.values.get(NAMED_SESSIONS_KEY) as { entries: { connection: { organizationId: string } }[] }).entries[0].connection.organizationId).toBe('55');
    const profile = { id: 'old-org', name: 'Old organization', scope: { kind: 'organization' as const, host: 'github.com' as const, accountId: '1', organizationId: '55' }, preferences: { density: 'compact' as const } };
    expect(centerProfileResolution({ ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, profiles: [profile], selected: ['old-org'] } }, result).preferences.density).toBe('comfortable');
});
