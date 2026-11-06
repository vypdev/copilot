import { afterEach } from 'vitest';
import { historyGatewayFixture } from './history_gateway.ts';
import { temporaryStoreFixture } from './temporary_pause_store.ts';
import { seedClearHistory } from './clear_gateway.ts';
import { decodeCurrentOperation } from '../../src/domain/current_operation.ts';
import { validJournalSnapshot } from '../../src/domain/local_journal.ts';
import type { PauseReviewIntent, PauseReviewPlan } from '../../src/domain/temporary_pause_review.ts';
import type { JournalKind } from '../../src/domain/journal_facts.ts';

const owners: ReturnType<typeof historyGatewayFixture>[] = []; afterEach(() => { for (const h of owners.splice(0)) h.history.stop(); });
export async function pauseGatewayFixture(retaining = false) {
    const native = temporaryStoreFixture(); const h = historyGatewayFixture(true, false, native.store); owners.push(h);
    seedClearHistory(h, retaining); await h.history.refresh(); const owner = await h.open();
    const current = async () => { const value = decodeCurrentOperation(await h.call({ method: 'center.operation.read', clientId: owner.clientId })); if (!value) throw new Error('missing-pause-observation'); return value; };
    const preview = async (intent: PauseReviewIntent = { type: 'emergency', paused: true }, expectedRevision = 0) => {
        const result = await h.call({ ...owner, method: 'center.pauses.preview', intent, expectedRevision }) as PauseReviewPlan;
        if (result.state !== 'preview') throw new Error(`missing-pause-preview:${result.state}`); return result;
    };
    return { ...h, native, owner, current, preview,
        confirm: (plan: PauseReviewPlan) => h.call({ ...owner, method: 'center.pauses.confirm', operationId: plan.operationId, expectedRevision: plan.revision }),
        cancel: (plan: PauseReviewPlan) => h.call({ ...owner, method: 'center.pauses.cancel', operationId: plan.operationId, expectedRevision: plan.revision }),
        rows: (kind: JournalKind = 'diagnostics') => { const value = h.documents.get(kind); return validJournalSnapshot(kind, value) ? value.entries : []; } };
}
