import { historyGatewayFixture } from './history_gateway.ts';
import { collectionSettings } from './collection_coordinator.ts';
import { activeCollectionPolicy } from './collection_policy.ts';
import { helper, destination } from './local_journal.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { decodeJournalClearPreview } from '../../src/domain/journal_clear_reply.ts';
import { decodeCurrentOperation } from '../../src/domain/current_operation.ts';
import { decideJournal, validJournalSnapshot } from '../../src/domain/local_journal.ts';
import type { JournalKind } from '../../src/domain/journal_facts.ts';

export function seedClearHistory(f: ReturnType<typeof historyGatewayFixture>, retaining = false): void {
    f.values.set(SETTINGS_KEY, collectionSettings(retaining));
    if (retaining) f.policiesData.set('diagnostics', activeCollectionPolicy());
    for (const kind of ['diagnostics', 'recents'] as const) {
        const now = Date.now(); const decision = decideJournal(kind, undefined, { type: 'append', now, at: now, epoch: 0, fact: kind === 'diagnostics' ? helper : destination });
        if (!decision.write) throw new Error('clear-seed-failed'); f.documents.set(kind, decision.write);
    }
}
export async function clearGatewayFixture(retaining = false) {
    const f = historyGatewayFixture(); seedClearHistory(f, retaining); await f.history.refresh(); const owner = await f.open();
    const current = async () => {
        const result = decodeCurrentOperation(await f.call({ method: 'center.operation.read', clientId: owner.clientId }));
        if (!result) throw new Error('invalid-current-operation'); return result;
    };
    const preview = async (kind: JournalKind = 'diagnostics') => {
        const result = decodeJournalClearPreview(await f.call({ ...owner, method: 'center.history.clear.preview', kind }));
        if (result?.state !== 'preview') throw new Error(`invalid-preview:${result?.state}`); return result;
    };
    return { ...f, owner, current, preview,
        confirm: (operationId: string) => f.call({ ...owner, method: 'center.history.clear.confirm', operationId }),
        rows: (kind: JournalKind = 'diagnostics') => { const value = f.documents.get(kind); return validJournalSnapshot(kind, value) ? value.entries : []; } };
}
