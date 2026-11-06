import { historyGatewayFixture } from './history_gateway.ts';
import { collectionSettings } from './collection_coordinator.ts';
import { activeCollectionPolicy } from './collection_policy.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { decodeCollectionPreview } from '../../src/domain/collection_reply.ts';
import { decodeCurrentOperation } from '../../src/domain/current_operation.ts';
import { validJournalSnapshot } from '../../src/domain/local_journal.ts';
import type { CollectionAction } from '../../src/domain/collection_review.ts';
import type { JournalKind } from '../../src/domain/journal_facts.ts';

export async function compoundGatewayFixture(active = false) {
    const f = historyGatewayFixture(); f.values.set(SETTINGS_KEY, collectionSettings(active));
    if (active) f.policiesData.set('diagnostics', activeCollectionPolicy()); await f.history.refresh();
    const owner = await f.open();
    const current = async () => {
        const result = decodeCurrentOperation(await f.call({ method: 'center.operation.read', clientId: owner.clientId }));
        if (!result) throw new Error('invalid-current-operation'); return result;
    };
    const preview = async (action: CollectionAction = 'start', kind: JournalKind = 'diagnostics') => {
        const result = decodeCollectionPreview(await f.call({ ...owner, method: 'center.collection.preview', kind, action }));
        if (result?.state !== 'preview') throw new Error(`invalid-preview:${result?.state}`); return result;
    };
    return { ...f, owner, current, preview,
        confirm: (operationId: string) => f.call({ ...owner, method: 'center.collection.confirm', operationId }),
        rows: () => { const value = f.documents.get('diagnostics'); return validJournalSnapshot('diagnostics', value) ? value.entries : []; } };
}
