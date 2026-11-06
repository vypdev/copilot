import { clearIssue, type JournalClearIssue } from './clear_operation.ts';
import { deepFreeze, keys, record } from './value.ts';

export interface ClearFact {
    readonly kind: 'clear-operation'; readonly action: 'clear'; readonly collection: 'diagnostics' | 'recents';
    readonly state: 'reviewed' | 'running' | 'cancelled' | 'blocked' | 'settled'; readonly submitted: boolean;
    readonly result: 'pending' | 'cancelled' | 'blocked' | 'observed-cleared' | 'unknown' | 'not-applied' | JournalClearIssue;
    readonly acknowledgement: 'not-observed' | 'accepted' | 'unknown' | 'not-applied';
    readonly observation: 'not-observed' | 'cleared' | 'changed' | 'unavailable' | 'not-applied';
    readonly notAppliedReason: 'not-started' | 'aborted' | null; readonly sourceCurrentAtObservation: boolean | null;
    readonly incomplete: boolean;
}
const FIELDS = ['kind', 'action', 'collection', 'state', 'submitted', 'result', 'acknowledgement', 'observation', 'notAppliedReason', 'sourceCurrentAtObservation', 'incomplete'];
export function validClearFact(value: unknown): value is ClearFact {
    if (!record(value) || !keys(value, FIELDS) || Object.keys(value).length !== FIELDS.length || value.kind !== 'clear-operation' || value.action !== 'clear'
        || !['diagnostics', 'recents'].includes(value.collection as string) || typeof value.submitted !== 'boolean' || typeof value.incomplete !== 'boolean'
        || !(value.sourceCurrentAtObservation === null || typeof value.sourceCurrentAtObservation === 'boolean')
        || !['not-observed', 'accepted', 'unknown', 'not-applied'].includes(value.acknowledgement as string)
        || !['not-observed', 'cleared', 'changed', 'unavailable', 'not-applied'].includes(value.observation as string)
        || !(value.notAppliedReason === null || value.notAppliedReason === 'not-started' || value.notAppliedReason === 'aborted')
        || !value.submitted && value.acknowledgement !== 'not-observed' && !value.incomplete) return false;
    if (value.state === 'reviewed' || value.state === 'cancelled' || value.state === 'blocked') return !value.submitted
        && value.result === (value.state === 'reviewed' ? 'pending' : value.state) && value.acknowledgement === 'not-observed'
        && value.observation === 'not-observed' && value.sourceCurrentAtObservation === null && value.notAppliedReason === null;
    if (value.state === 'running') return value.result === 'pending' && value.observation === 'not-observed' && value.notAppliedReason === null
        && value.sourceCurrentAtObservation === null && (value.submitted ? value.acknowledgement !== 'not-observed' : true);
    if (value.state !== 'settled') return false;
    if (value.result === 'observed-cleared' || value.result === 'unknown') return (value.acknowledgement === 'accepted' || value.acknowledgement === 'unknown')
        && typeof value.sourceCurrentAtObservation === 'boolean' && value.notAppliedReason === null
        && (value.result === 'observed-cleared' ? value.observation === 'cleared' : value.observation === 'changed' || value.observation === 'unavailable');
    if (value.result === 'not-applied') return value.acknowledgement === 'not-applied' && value.observation === 'not-applied'
        && value.notAppliedReason !== null && value.sourceCurrentAtObservation === null;
    return clearIssue(value.result) && value.notAppliedReason === null && value.sourceCurrentAtObservation === null
        && (value.acknowledgement === 'not-observed' ? !value.submitted && value.observation === 'not-observed' : value.observation === 'unavailable');
}
export function sameClearFact(a: ClearFact, b: ClearFact): boolean { return FIELDS.every(key => a[key as keyof ClearFact] === b[key as keyof ClearFact]); }
export function clearFactTransition(before: ClearFact, after: ClearFact): boolean {
    const acknowledgement = before.acknowledgement === after.acknowledgement || before.acknowledgement === 'not-observed'
        || before.acknowledgement === 'unknown' && (after.acknowledgement === 'accepted' || after.acknowledgement === 'not-applied');
    return before.collection === after.collection && (sameClearFact(before, after) || (before.state === 'reviewed' || before.state === 'running')
        && (before.state !== 'running' || after.state === 'running' || after.state === 'settled') && (!before.submitted || after.submitted)
        && (!before.incomplete || after.incomplete) && acknowledgement);
}
export function freezeClearFact(value: ClearFact): ClearFact {
    const copy = { ...value }; if (!validClearFact(copy)) throw new Error('invalid-clear-observation'); return deepFreeze(copy);
}
export function mergeClearFact(before: ClearFact, after: ClearFact): ClearFact | null {
    if (!validClearFact(before) || !validClearFact(after) || !clearFactTransition(before, after)) return null;
    return sameClearFact(before, after) ? before : freezeClearFact(after);
}
export function initialClearFact(collection: ClearFact['collection']): ClearFact {
    return freezeClearFact({ kind: 'clear-operation', action: 'clear', collection, state: 'reviewed', submitted: false, result: 'pending',
        acknowledgement: 'not-observed', observation: 'not-observed', notAppliedReason: null, sourceCurrentAtObservation: null, incomplete: false });
}
