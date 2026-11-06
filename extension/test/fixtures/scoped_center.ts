import { vi } from 'vitest';
import { namedSessionsFixture, CONNECTION_INPUT } from './named_sessions.ts';
import { centerClientFixture } from './center_client.ts';
export async function scopedCenterFixture(viewerId = '1', repositoryId = '7', organizationId: string | null = '55') {
    const h = namedSessionsFixture();
    vi.mocked(h.reader.read).mockImplementation(async request => ({ state: 'ok', etag: '', bytes: 12,
        data: request.type === 'viewer' ? { id: viewerId, login: 'octo' } : { id: repositoryId, name: 'company/example', organizationId } }));
    await h.connections.change({ ...CONNECTION_INPUT, repository: 'company/example' }, 0, h.current);
    return { ...h, application: centerClientFixture(h.center) };
}
