import { afterEach } from 'vitest';
import { historyGatewayFixture } from './history_gateway.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { collectionSettings } from './collection_coordinator.ts';
import { activeCollectionPolicy } from './collection_policy.ts';

type Owner = Awaited<ReturnType<ReturnType<typeof historyGatewayFixture>['open']>>;
const owners: ReturnType<typeof historyGatewayFixture>[] = [];
afterEach(() => { owners.splice(0).forEach(f => f.history.stop()); });
export async function activeRecents(f: ReturnType<typeof historyGatewayFixture>): Promise<void> {
    f.values.set(SETTINGS_KEY, collectionSettings(false, true)); f.policiesData.set('recents', activeCollectionPolicy('recents')); await f.history.refresh();
}
export async function recentsGatewayFixture(active = true) {
    const f = historyGatewayFixture(); owners.push(f); if (active) await activeRecents(f); const owner = await f.open();
    const capture = (source = owner, sender?: Parameters<typeof f.call>[1]) => f.call({ method: 'center.recents.capture', ...source }, sender) as Promise<{ state: string; permit: string | null; epoch: number | null; sequence: number }>;
    const observe = (permit: string, sequence = 1, destination = { route: 'privacy' }, source: Owner = owner, sender?: Parameters<typeof f.call>[1]) => f.call({ method: 'center.recents.observe', ...source, permit, sequence, destination }, sender);
    return { ...f, owner, capture, observe };
}
