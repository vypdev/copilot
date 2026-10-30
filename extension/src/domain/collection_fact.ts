import { keys, record, natural, deepFreeze } from './value.ts';
import { COLLECTION_REASONS, type CollectionAction, type CollectionPolicyFact, type CollectionReason } from './collection_operation.ts';

export interface CollectionPreferenceFact {
    readonly phase: 'not-observed' | 'submitted' | 'settled' | 'blocked';
    readonly acknowledgement: 'not-submitted' | 'accepted' | 'unknown';
    readonly observation: 'not-observed' | 'committed' | 'unchanged' | 'changed' | 'unavailable';
}
export interface CollectionPolicyObservation extends CollectionPolicyFact { readonly phase: 'not-observed' | 'submitted' | 'observed' }
export interface CollectionFact {
    readonly kind: 'collection-operation'; readonly collection: 'diagnostics' | 'recents'; readonly action: CollectionAction;
    readonly state: 'reviewed' | 'running' | 'cancelled' | 'blocked' | 'settled';
    readonly result: 'pending' | 'cancelled' | 'blocked' | CollectionReason;
    readonly preferenceRequired: boolean; readonly preference: CollectionPreferenceFact;
    readonly pause: CollectionPolicyObservation; readonly activation: CollectionPolicyObservation;
    readonly preferenceVerifiedAtObservation: boolean; readonly admittedAtObservation: boolean;
    readonly sourceCurrentAtObservation: boolean; readonly incomplete: boolean;
}
const fields = (value: unknown, names: string[]): value is Record<string, unknown> => record(value) && keys(value, names) && Object.keys(value).length === names.length;
export function collectionPreferenceFact(value: unknown): value is CollectionPreferenceFact {
    return fields(value, ['phase', 'acknowledgement', 'observation']) && (value.phase === 'not-observed' || value.phase === 'blocked'
        ? value.acknowledgement === 'not-submitted' && value.observation === 'not-observed'
        : value.phase === 'submitted' ? value.acknowledgement === 'unknown' && value.observation === 'not-observed'
            : value.phase === 'settled' && ['accepted', 'unknown'].includes(value.acknowledgement as string)
                && ['committed', 'unchanged', 'changed', 'unavailable'].includes(value.observation as string));
}
export function collectionPolicyObservation(value: unknown): value is CollectionPolicyObservation {
    if (!fields(value, ['phase', 'acknowledgement', 'observation', 'revision', 'attributed']) || typeof value.attributed !== 'boolean') return false;
    if (value.phase === 'not-observed' || value.phase === 'submitted') return value.acknowledgement === (value.phase === 'submitted' ? 'unknown' : 'not-attempted')
        && value.observation === 'unavailable' && value.revision === null && value.attributed === false;
    return value.phase === 'observed' && ['not-attempted', 'not-applied', 'accepted', 'unknown'].includes(value.acknowledgement as string)
        && (value.observation === 'unavailable' ? value.revision === null && value.attributed === false
            : ['active', 'paused'].includes(value.observation as string) && natural(value.revision));
}
const emptyPolicy = (value: CollectionPolicyObservation) => value.phase === 'not-observed';
export function validCollectionFact(value: unknown): value is CollectionFact {
    if (!fields(value, ['kind', 'collection', 'action', 'state', 'result', 'preferenceRequired', 'preference', 'pause', 'activation',
        'preferenceVerifiedAtObservation', 'admittedAtObservation', 'sourceCurrentAtObservation', 'incomplete'])
        || value.kind !== 'collection-operation' || !['diagnostics', 'recents'].includes(value.collection as string)
        || !['start', 'stop'].includes(value.action as string) || !['preferenceRequired', 'preferenceVerifiedAtObservation', 'admittedAtObservation', 'sourceCurrentAtObservation', 'incomplete'].every(key => typeof value[key] === 'boolean')
        || !collectionPreferenceFact(value.preference) || !collectionPolicyObservation(value.pause) || !collectionPolicyObservation(value.activation)
        || value.action === 'stop' && (!emptyPolicy(value.activation) || value.admittedAtObservation)
        || value.pause.attributed && (value.pause.observation !== 'paused' || value.pause.acknowledgement === 'not-attempted')
        || value.activation.attributed && (value.activation.observation !== 'active' || value.activation.acknowledgement === 'not-attempted')
        || value.state !== 'settled' && (value.preferenceVerifiedAtObservation || value.admittedAtObservation || value.sourceCurrentAtObservation)) return false;
    if (value.state === 'reviewed') return value.result === 'pending' && value.preference.phase === 'not-observed' && emptyPolicy(value.pause) && emptyPolicy(value.activation);
    if (value.state === 'running') return value.result === 'pending';
    if (value.state === 'cancelled' || value.state === 'blocked') return value.result === value.state && value.preference.phase === 'not-observed'
        && emptyPolicy(value.pause) && emptyPolicy(value.activation);
    return value.state === 'settled' && COLLECTION_REASONS.includes(value.result as CollectionReason)
        && (value.incomplete === true || value.preference.phase !== 'submitted' && value.pause.phase !== 'submitted' && value.activation.phase !== 'submitted');
}
export function sameCollectionPreference(a: CollectionPreferenceFact, b: CollectionPreferenceFact): boolean {
    return a.phase === b.phase && a.acknowledgement === b.acknowledgement && a.observation === b.observation;
}
export function sameCollectionPolicy(a: CollectionPolicyObservation, b: CollectionPolicyObservation): boolean {
    return a.phase === b.phase && a.acknowledgement === b.acknowledgement && a.observation === b.observation && a.revision === b.revision && a.attributed === b.attributed;
}
export function sameCollectionFact(a: CollectionFact, b: CollectionFact): boolean {
    return a.collection === b.collection && a.action === b.action && a.state === b.state && a.result === b.result && a.preferenceRequired === b.preferenceRequired
        && a.preferenceVerifiedAtObservation === b.preferenceVerifiedAtObservation && a.admittedAtObservation === b.admittedAtObservation
        && a.sourceCurrentAtObservation === b.sourceCurrentAtObservation && a.incomplete === b.incomplete && sameCollectionPreference(a.preference, b.preference)
        && sameCollectionPolicy(a.pause, b.pause) && sameCollectionPolicy(a.activation, b.activation);
}
export function collectionFactTransition(before: CollectionFact, after: CollectionFact): boolean {
    const policy = (a: CollectionPolicyObservation, b: CollectionPolicyObservation) => sameCollectionPolicy(a, b)
        || a.phase === 'not-observed' || a.phase === 'submitted' && b.phase === 'observed';
    const preference = sameCollectionPreference(before.preference, after.preference) || before.preference.phase === 'not-observed'
        || before.preference.phase === 'submitted' && after.preference.phase === 'settled';
    return before.collection === after.collection && before.action === after.action && before.preferenceRequired === after.preferenceRequired
        && (sameCollectionFact(before, after) || (before.state === 'reviewed' || before.state === 'running') && (before.state !== 'running' || after.state === 'running' || after.state === 'settled')
            && (!before.incomplete || after.incomplete) && preference && policy(before.pause, after.pause) && policy(before.activation, after.activation));
}
export function freezeCollectionFact(value: CollectionFact): CollectionFact {
    const copy = { ...value, preference: { ...value.preference }, pause: { ...value.pause }, activation: { ...value.activation } };
    if (!validCollectionFact(copy)) throw new Error('invalid-collection-observation'); return deepFreeze(copy);
}
export function mergeCollectionFact(before: CollectionFact, after: CollectionFact): CollectionFact | null {
    if (!validCollectionFact(before) || !validCollectionFact(after) || !collectionFactTransition(before, after)) return null;
    return sameCollectionFact(before, after) ? before : freezeCollectionFact(after);
}
export function initialCollectionFact(collection: CollectionFact['collection'], action: CollectionAction, preferenceRequired: boolean): CollectionFact {
    const policy: CollectionPolicyObservation = { phase: 'not-observed', acknowledgement: 'not-attempted', observation: 'unavailable', revision: null, attributed: false };
    return freezeCollectionFact({ kind: 'collection-operation', collection, action, state: 'reviewed', result: 'pending', preferenceRequired,
        preference: { phase: 'not-observed', acknowledgement: 'not-submitted', observation: 'not-observed' }, pause: policy, activation: policy,
        preferenceVerifiedAtObservation: false, admittedAtObservation: false, sourceCurrentAtObservation: false, incomplete: false });
}
