import type { CollectionInspection, CollectionOutcome, CollectionPreview } from './collection_review.ts';
import { decodeCenterOutcome } from './center_reply.ts';
import { journalKind } from './journal_facts.ts';
import { settingsOperationId } from './settings_operation.ts';
import { natural, record } from './value.ts';
import { decodeHistoryValue, exactHistoryFields as exact } from './history_decode.ts';

const ISSUES = ['invalid', 'denied', 'stale', 'expired', 'unavailable', 'busy', 'future', 'corrupt', 'migration-required', 'conflict', 'globally-paused', 'pause-unconfirmed', 'exhausted'];
function preview(value: unknown): value is CollectionPreview {
    if (!record(value)) return false;
    if (value.state !== 'preview') return exact(value, ['state']) && [...ISSUES, 'unchanged'].includes(value.state as string);
    return exact(value, ['state', 'operationId', 'kind', 'action', 'settingsRevision', 'policyRevision', 'preferenceBefore', 'preferenceAfter', 'policyBefore', 'policyAfter', 'expiresAt'])
        && settingsOperationId(value.operationId) && journalKind(value.kind) && (value.action === 'start' || value.action === 'stop')
        && natural(value.settingsRevision) && ['active', 'paused', 'unknown'].includes(value.policyBefore as string)
        && (value.policyBefore === 'unknown' ? value.policyRevision === null : natural(value.policyRevision))
        && typeof value.preferenceBefore === 'boolean' && value.preferenceAfter === (value.action === 'start')
        && value.policyAfter === (value.action === 'start' ? 'active' : 'paused') && natural(value.expiresAt);
}
function preference(value: unknown): boolean {
    if (!record(value)) return false;
    if (value.state === 'already' || value.state === 'not-attempted') return exact(value, ['state', 'revision']) && natural(value.revision);
    return ['committed', 'replayed', 'conflict', 'invalid', 'stale', 'unavailable', 'unknown'].includes(value.state as string) && decodeCenterOutcome(value) !== null;
}
function observedPreference(value: unknown): boolean {
    return value === null || exact(value, ['enabled', 'revision']) && typeof value.enabled === 'boolean' && natural(value.revision);
}
function policy(value: unknown): boolean {
    return exact(value, ['acknowledgement', 'observation', 'revision', 'attributed'])
        && ['not-attempted', 'not-applied', 'accepted', 'unknown'].includes(value.acknowledgement as string)
        && ['active', 'paused', 'unavailable'].includes(value.observation as string)
        && (value.observation === 'unavailable' ? value.revision === null : natural(value.revision)) && typeof value.attributed === 'boolean';
}
function outcome(value: unknown): value is CollectionOutcome {
    if (!record(value)) return false;
    if (value.state !== 'settled') return exact(value, ['state']) && [...ISSUES, 'cancelled', 'pending'].includes(value.state as string);
    return exact(value, ['state', 'action', 'kind', 'reason', 'preference', 'observedPreference', 'preferenceVerifiedAtObservation', 'policy', 'admittedAtObservation', 'sourceCurrentAtObservation'])
        && (value.action === 'start' || value.action === 'stop') && journalKind(value.kind)
        && ['done', 'busy', 'stale', 'preference-unconfirmed', 'policy-unconfirmed', 'changed', 'unavailable'].includes(value.reason as string)
        && preference(value.preference) && observedPreference(value.observedPreference) && typeof value.preferenceVerifiedAtObservation === 'boolean'
        && policy(value.policy) && typeof value.admittedAtObservation === 'boolean' && typeof value.sourceCurrentAtObservation === 'boolean';
}
export const decodeCollectionPreview = (value: unknown): CollectionPreview | null => decodeHistoryValue(value, preview);
export const decodeCollectionOutcome = (value: unknown): CollectionOutcome | null => decodeHistoryValue(value, outcome);
export const decodeCollectionInspection = (value: unknown): CollectionInspection | null => decodeHistoryValue(value,
    (candidate): candidate is CollectionInspection => exact(candidate, ['state']) && candidate.state === 'not-submitted' || outcome(candidate));
