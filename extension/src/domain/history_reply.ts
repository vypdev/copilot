import type { HistoryDocument, RetainedHistory } from './history_document.ts';
import type { CollectionState, JournalWriterState } from './history_state.ts';
import { journalKind, type JournalKind } from './journal_facts.ts';
import { validJournalSnapshot } from './local_journal.ts';
import { natural, record } from './value.ts';
import { decodeHistoryValue, exactHistoryFields as exact } from './history_decode.ts';

function restriction(value: unknown): boolean {
    return value === null || exact(value, ['acknowledgement', 'observation', 'policyRevision', 'sourceCurrentAtObservation'])
        && ['not-attempted', 'not-applied', 'accepted', 'unknown'].includes(value.acknowledgement as string)
        && ['paused', 'active', 'unavailable'].includes(value.observation as string)
        && (value.observation === 'unavailable' ? value.policyRevision === null : natural(value.policyRevision))
        && typeof value.sourceCurrentAtObservation === 'boolean';
}
function collection(value: unknown, kind: JournalKind): value is CollectionState {
    return exact(value, ['kind', 'preference', 'globallyPaused', 'policy', 'policyRevision', 'collecting', 'sessionBlocked', 'busy', 'restriction'])
        && value.kind === kind && ['on', 'off', 'unknown'].includes(value.preference as string)
        && (value.globallyPaused === null || typeof value.globallyPaused === 'boolean')
        && ['active', 'paused', 'future', 'corrupt', 'unavailable'].includes(value.policy as string)
        && (value.policy === 'active' || value.policy === 'paused' ? natural(value.policyRevision) : value.policyRevision === null)
        && typeof value.collecting === 'boolean' && typeof value.sessionBlocked === 'boolean' && typeof value.busy === 'boolean'
        && (!value.collecting || value.preference === 'on' && value.globallyPaused === false && value.policy === 'active'
            && !value.sessionBlocked && (value.policyRevision as number) < Number.MAX_SAFE_INTEGER)
        && restriction(value.restriction);
}
function writer(value: unknown, kind: JournalKind): value is JournalWriterState {
    return exact(value, ['kind', 'epoch', 'observedRevision', 'pending', 'incomplete', 'dropped', 'issue']) && value.kind === kind
        && (value.epoch === null ? value.observedRevision === null : natural(value.epoch) && natural(value.observedRevision) && value.epoch <= value.observedRevision)
        && natural(value.pending) && value.pending <= 200 && natural(value.dropped)
        && value.incomplete === (value.dropped > 0) && ['none', 'not-ready', 'capacity', 'invalid', 'clock-invalid', 'stale', 'unavailable', 'unknown'].includes(value.issue as string)
        && (value.dropped === 0 ? value.issue === 'none' : value.issue !== 'none');
}
function retained(value: unknown, kind: JournalKind, owner: JournalWriterState): value is RetainedHistory {
    if (!record(value)) return false;
    return value.state === 'ready' ? exact(value, ['state', 'snapshot']) && validJournalSnapshot(kind, value.snapshot)
        && value.snapshot.epoch === owner.epoch && value.snapshot.revision === owner.observedRevision
        : exact(value, ['state']) && ['future', 'corrupt', 'clock-invalid', 'exhausted', 'unavailable'].includes(value.state as string);
}
export function decodeHistoryDocument(value: unknown): HistoryDocument | null {
    return decodeHistoryValue(value, (candidate): candidate is HistoryDocument =>
        exact(candidate, ['state', 'kind', 'collection', 'writer', 'retained']) && candidate.state === 'ready' && journalKind(candidate.kind)
        && collection(candidate.collection, candidate.kind) && writer(candidate.writer, candidate.kind)
        && retained(candidate.retained, candidate.kind, candidate.writer));
}
