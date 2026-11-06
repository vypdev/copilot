import { keys, record, deepFreeze } from './value.ts';
import { validPauseReviewIntent, type PauseReviewIntent } from './temporary_pause_review.ts';

export const PAUSE_ACTIONS = ['pause-emergency', 'resume-emergency', 'pause-tab', 'resume-tab', 'adopt-pauses'] as const;
export type PauseAction = typeof PAUSE_ACTIONS[number];
export const PAUSE_RESULTS = ['pending', 'cancelled', 'committed', 'reconciled', 'unknown', 'invalid', 'conflict', 'stale', 'unavailable', 'future', 'corrupt', 'busy', 'unchanged'] as const;
type PauseResultIssue = 'invalid' | 'conflict' | 'stale' | 'unavailable' | 'future' | 'corrupt' | 'busy' | 'unchanged';
export const pauseResultIssue = (value: unknown): value is PauseResultIssue => ['invalid', 'conflict', 'stale', 'unavailable', 'future', 'corrupt', 'busy', 'unchanged'].includes(value as string);
export interface PauseFact {
    readonly kind: 'pause-operation'; readonly action: PauseAction;
    readonly state: 'reviewed' | 'running' | 'cancelled' | 'settled'; readonly submitted: boolean;
    readonly result: typeof PAUSE_RESULTS[number]; readonly acknowledgement: 'not-observed' | 'accepted' | 'unknown';
    readonly observation: 'not-observed' | 'committed' | 'different' | 'unavailable' | 'adopted';
    readonly sourceCurrentAtObservation: boolean | null; readonly incomplete: boolean;
}
const FIELDS = ['kind', 'action', 'state', 'submitted', 'result', 'acknowledgement', 'observation', 'sourceCurrentAtObservation', 'incomplete'];
export function pauseAction(value: unknown): PauseAction | null {
    if (!validPauseReviewIntent(value)) return null;
    const intent: PauseReviewIntent = value;
    return intent.type === 'adopt-observed' ? 'adopt-pauses' : intent.type === 'emergency'
        ? intent.paused ? 'pause-emergency' : 'resume-emergency' : intent.paused ? 'pause-tab' : 'resume-tab';
}
export function validPauseFact(value: unknown): value is PauseFact {
    if (!record(value) || !keys(value, FIELDS) || Object.keys(value).length !== FIELDS.length || value.kind !== 'pause-operation'
        || !PAUSE_ACTIONS.includes(value.action as PauseAction) || !PAUSE_RESULTS.includes(value.result as PauseFact['result'])
        || typeof value.submitted !== 'boolean' || typeof value.incomplete !== 'boolean'
        || !['not-observed', 'accepted', 'unknown'].includes(value.acknowledgement as string)
        || !['not-observed', 'committed', 'different', 'unavailable', 'adopted'].includes(value.observation as string)
        || !(value.sourceCurrentAtObservation === null || typeof value.sourceCurrentAtObservation === 'boolean')) return false;
    if (value.action === 'adopt-pauses' && (value.submitted || value.acknowledgement !== 'not-observed')) return false;
    if (value.state === 'reviewed' || value.state === 'cancelled') return !value.submitted && !value.incomplete
        && value.result === (value.state === 'reviewed' ? 'pending' : value.state) && value.acknowledgement === 'not-observed'
        && value.observation === 'not-observed' && value.sourceCurrentAtObservation === null;
    if (value.state === 'running') return value.result === 'pending' && value.sourceCurrentAtObservation === null
        && value.observation !== 'adopted' && (value.acknowledgement === 'not-observed' ? !value.submitted && value.observation === 'not-observed' : value.submitted || value.incomplete);
    if (value.state !== 'settled' || ['pending', 'cancelled'].includes(value.result as string)) return false;
    if (value.result === 'reconciled') return value.action === 'adopt-pauses' && value.observation === 'adopted' && typeof value.sourceCurrentAtObservation === 'boolean';
    if (value.result === 'committed' || value.result === 'unknown') return value.action !== 'adopt-pauses'
        && value.acknowledgement !== 'not-observed' && (value.submitted || value.incomplete) && typeof value.sourceCurrentAtObservation === 'boolean'
        && (value.result === 'committed' ? value.observation === 'committed' : ['committed', 'different', 'unavailable'].includes(value.observation as string));
    return value.sourceCurrentAtObservation === null && value.observation !== 'adopted'
        && (value.acknowledgement === 'not-observed' ? !value.submitted && value.observation === 'not-observed' : value.incomplete);
}
export function samePauseFact(a: PauseFact, b: PauseFact): boolean { return FIELDS.every(key => a[key as keyof PauseFact] === b[key as keyof PauseFact]); }
export function pauseFactTransition(before: PauseFact, after: PauseFact): boolean {
    return before.action === after.action && (samePauseFact(before, after) || (before.state === 'reviewed' || before.state === 'running')
        && (before.state !== 'running' || after.state === 'running' || after.state === 'settled')
        && (!before.submitted || after.submitted) && (!before.incomplete || after.incomplete)
        && (before.acknowledgement !== 'accepted' || after.acknowledgement === 'accepted')
        && (before.observation !== 'committed' || after.observation === 'committed'));
}
export function freezePauseFact(value: PauseFact): PauseFact {
    const copy = { ...value }; if (!validPauseFact(copy)) throw new Error('invalid-pause-observation'); return deepFreeze(copy);
}
export function mergePauseFact(before: PauseFact, after: PauseFact): PauseFact | null {
    if (!validPauseFact(before) || !validPauseFact(after) || !pauseFactTransition(before, after)) return null;
    return samePauseFact(before, after) ? before : freezePauseFact(after);
}
export function initialPauseFact(action: PauseAction): PauseFact {
    return freezePauseFact({ kind: 'pause-operation', action, state: 'reviewed', submitted: false, result: 'pending',
        acknowledgement: 'not-observed', observation: 'not-observed', sourceCurrentAtObservation: null, incomplete: false });
}
