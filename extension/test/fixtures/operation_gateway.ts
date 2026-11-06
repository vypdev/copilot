import { afterEach, vi } from 'vitest';
import { historyGatewayFixture } from './history_gateway.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { collectionSettings } from './collection_coordinator.ts';
import { activeCollectionPolicy } from './collection_policy.ts';
import type { CurrentOperationReply } from '../../src/domain/current_operation.ts';

const owners: ReturnType<typeof historyGatewayFixture>[] = [];
afterEach(() => { for (const f of owners.splice(0)) { f.history.stop(); f.center.shutdown(); } });
export async function operationGatewayFixture(mode: 'off' | 'on' | 'cold' = 'off') {
    const f = historyGatewayFixture(); owners.push(f);
    if (mode !== 'off') { f.values.set(SETTINGS_KEY, collectionSettings(true)); f.policiesData.set('diagnostics', activeCollectionPolicy()); }
    if (mode === 'on') await f.history.refresh();
    const owner = await f.open();
    const preview = async (intent: unknown = { type: 'preferences', values: { density: 'compact' } }) => {
        const value = await f.call({ ...owner, method: 'center.preview', expectedRevision: 0, intent }) as { state: string; operationId: string; revision: number };
        if (value.state !== 'preview') throw new Error('expected-preview'); return value;
    };
    const read = () => f.call({ method: 'center.operation.read', clientId: owner.clientId }) as Promise<CurrentOperationReply>;
    return { ...f, port: { ...f.port, get: vi.mocked(f.port.get), set: vi.mocked(f.port.set) }, owner, preview, read,
        confirm: (p: Awaited<ReturnType<typeof preview>>) => f.call({ ...owner, method: 'center.confirm', expectedRevision: p.revision, operationId: p.operationId }) };
}
