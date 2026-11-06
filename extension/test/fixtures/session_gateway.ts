import { afterEach, vi } from 'vitest';
import { historyGatewayFixture } from './history_gateway.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { collectionSettings } from './collection_coordinator.ts';
import { activeCollectionPolicy } from './collection_policy.ts';
import type { CurrentOperationReply } from '../../src/domain/current_operation.ts';
import type { JournalSnapshot } from '../../src/domain/local_journal.ts';
import type { ConnectionIntent } from '../../src/domain/named_sessions.ts';

const owners: ReturnType<typeof historyGatewayFixture>[] = [];
afterEach(() => { for (const f of owners.splice(0)) { f.history.stop(); f.center.shutdown(); } });
export async function sessionGatewayFixture(active = false, withHistory = true) {
    const f = historyGatewayFixture(withHistory, true); owners.push(f);
    if (active) { f.values.set(SETTINGS_KEY, collectionSettings(true)); f.policiesData.set('diagnostics', activeCollectionPolicy()); await f.history.refresh(); }
    const owner = await f.open();
    return { ...f, owner, settingsPort: { get: vi.mocked(f.port.get), set: vi.mocked(f.port.set) },
        protectedPort: { get: vi.mocked(f.sessions.port.get), set: vi.mocked(f.sessions.port.set), remove: vi.mocked(f.sessions.port.remove) },
        read: () => f.call({ method: 'center.operation.read', clientId: owner.clientId }) as Promise<CurrentOperationReply>,
        rows: () => (f.documents.get('diagnostics') as JournalSnapshot | undefined)?.entries ?? [],
        change: async (intent: ConnectionIntent, expectedRevision = 0) => { const current = await f.open(); return f.call({ ...current, method: 'center.connections.change', expectedRevision, intent }); } };
}
