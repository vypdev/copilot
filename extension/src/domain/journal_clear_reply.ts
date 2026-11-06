import type { JournalClearInspection, JournalClearOutcome, JournalClearPreview } from './journal_clear.ts';
import { journalKind } from './journal_facts.ts';
import { JOURNAL_LIMITS } from './local_journal.ts';
import { settingsOperationId } from './settings_operation.ts';
import { natural, record } from './value.ts';
import { decodeHistoryValue, exactHistoryFields as exact } from './history_decode.ts';
import { clearIssue } from './clear_operation.ts';

function preview(value: unknown): value is JournalClearPreview {
    if (!record(value)) return false;
    if (value.state !== 'preview') return exact(value, ['state']) && clearIssue(value.state);
    return exact(value, ['state', 'operationId', 'kind', 'epoch', 'revision', 'policyRevision', 'entries', 'expiresAt'])
        && settingsOperationId(value.operationId) && journalKind(value.kind) && natural(value.epoch) && natural(value.revision) && value.epoch <= value.revision
        && natural(value.policyRevision) && natural(value.entries) && value.entries <= JOURNAL_LIMITS[value.kind] && natural(value.expiresAt);
}
function outcome(value: unknown): value is JournalClearOutcome {
    if (!record(value)) return false;
    if (value.state === 'not-applied') return exact(value, ['state', 'reason']) && (value.reason === 'not-started' || value.reason === 'aborted');
    if (value.state === 'observed-cleared') return exact(value, ['state', 'acknowledgement', 'epoch', 'revision', 'sourceCurrentAtObservation'])
        && (value.acknowledgement === 'accepted' || value.acknowledgement === 'unknown') && natural(value.epoch) && value.epoch > 0
        && natural(value.revision) && value.revision >= value.epoch && typeof value.sourceCurrentAtObservation === 'boolean';
    if (value.state === 'unknown') return exact(value, ['state', 'acknowledgement', 'observation', 'sourceCurrentAtObservation'])
        && (value.acknowledgement === 'accepted' || value.acknowledgement === 'unknown') && (value.observation === 'changed' || value.observation === 'unavailable')
        && typeof value.sourceCurrentAtObservation === 'boolean';
    return exact(value, ['state']) && (clearIssue(value.state) || value.state === 'cancelled' || value.state === 'pending');
}
export const decodeJournalClearPreview = (value: unknown): JournalClearPreview | null => decodeHistoryValue(value, preview);
export const decodeJournalClearOutcome = (value: unknown): JournalClearOutcome | null => decodeHistoryValue(value, outcome);
export const decodeJournalClearInspection = (value: unknown): JournalClearInspection | null => decodeHistoryValue(value,
    (candidate): candidate is JournalClearInspection => exact(candidate, ['state']) && candidate.state === 'not-submitted' || outcome(candidate));
