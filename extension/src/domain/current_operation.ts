import { centerLocationHash, type CenterLocation } from './center_routes.ts';
import { journalFact, settingsJournalAction, type OperationFact } from './journal_facts.ts';
import type { JournalRetention } from './history_state.ts';
import { decodeHistoryValue, exactHistoryFields } from './history_decode.ts';
import { natural, record } from './value.ts';
import { validSessionFact, type SessionFact } from './session_fact.ts';
import { validCollectionFact, type CollectionFact } from './collection_fact.ts';

/** Private target detail is current-worker memory only, never a generated journal fact. */
export interface CurrentTarget { readonly location: CenterLocation; readonly label: string | null }
export const OPERATION_STAGES = ['reviewed', 'confirming', 'submitted', 'cancelled', 'blocked', 'settled', 'unknown'] as const;
export type OperationStage = typeof OPERATION_STAGES[number];
export interface CurrentSettingsOperation {
    readonly family: 'settings'; readonly stage: OperationStage; readonly fact: OperationFact;
    readonly target: CurrentTarget | null; readonly sourceCurrent: boolean; readonly firstObserved: number;
    readonly retention: JournalRetention;
}
export interface CurrentSessionOperation {
    readonly family: 'sessions'; readonly stage: SessionFact['state']; readonly fact: SessionFact;
    readonly target: CurrentTarget | null; readonly sourceCurrent: boolean; readonly firstObserved: number; readonly retention: JournalRetention;
}
export interface CurrentCollectionOperation {
    readonly family: 'collection'; readonly stage: CollectionFact['state']; readonly fact: CollectionFact;
    readonly target: CurrentTarget | null; readonly sourceCurrent: boolean; readonly firstObserved: number; readonly retention: JournalRetention;
}
export type CurrentOperationReply = { readonly state: 'empty' } | { readonly state: 'current'; readonly operation: CurrentSettingsOperation | CurrentSessionOperation | CurrentCollectionOperation };
export interface CurrentOperationView {
    readonly phase: 'idle' | 'reading' | 'ready' | 'unavailable'; readonly current: boolean; readonly value: CurrentOperationReply | null;
}
export const EMPTY_CURRENT_OPERATION: CurrentOperationView = Object.freeze({ phase: 'idle', current: false, value: null });
export function currentTarget(value: unknown): value is CurrentTarget {
    return exactHistoryFields(value, ['location', 'label']) && centerLocationHash(value.location) !== null
        && (value.label === null || typeof value.label === 'string' && value.label.trim().length > 0
            && value.label.length <= 80 && !/[\p{Cc}\p{Cf}]/u.test(value.label));
}
export function currentSettingsOperation(value: unknown): value is CurrentSettingsOperation {
    if (!exactHistoryFields(value, ['family', 'stage', 'fact', 'target', 'sourceCurrent', 'firstObserved', 'retention'])
        || value.family !== 'settings' || !OPERATION_STAGES.includes(value.stage as OperationStage)
        || !record(value.fact) || value.fact.kind !== 'operation' || !journalFact('diagnostics', value.fact) || !settingsJournalAction(value.fact.action)
        || typeof value.sourceCurrent !== 'boolean' || !natural(value.firstObserved)
        || !(value.target === null || value.sourceCurrent && currentTarget(value.target))
        || !['pending', 'stored', 'not-retained', 'unknown', 'untracked'].includes(value.retention as string)) return false;
    const phase = value.fact.phase;
    return value.stage === 'confirming' ? phase === 'reviewed' : value.stage === 'unknown'
        ? phase === 'reviewed' || phase === 'submitted' || phase === 'settled' : value.stage === phase;
}
export function currentSessionOperation(value: unknown): value is CurrentSessionOperation {
    return exactHistoryFields(value, ['family', 'stage', 'fact', 'target', 'sourceCurrent', 'firstObserved', 'retention'])
        && value.family === 'sessions' && validSessionFact(value.fact) && value.stage === value.fact.state
        && typeof value.sourceCurrent === 'boolean' && natural(value.firstObserved)
        && (value.target === null || value.sourceCurrent && currentTarget(value.target))
        && ['pending', 'stored', 'not-retained', 'unknown', 'untracked'].includes(value.retention as string);
}
export function decodeCurrentOperation(value: unknown): CurrentOperationReply | null {
    return decodeHistoryValue(value, (v): v is CurrentOperationReply => exactHistoryFields(v, ['state']) && v.state === 'empty'
        || exactHistoryFields(v, ['state', 'operation']) && v.state === 'current' && (currentSettingsOperation(v.operation) || currentSessionOperation(v.operation) || currentCollectionOperation(v.operation)));
}
export function currentCollectionOperation(value: unknown): value is CurrentCollectionOperation {
    return exactHistoryFields(value, ['family', 'stage', 'fact', 'target', 'sourceCurrent', 'firstObserved', 'retention'])
        && value.family === 'collection' && validCollectionFact(value.fact) && value.stage === value.fact.state
        && typeof value.sourceCurrent === 'boolean' && natural(value.firstObserved)
        && (value.target === null || value.sourceCurrent && currentTarget(value.target))
        && ['pending', 'stored', 'not-retained', 'unknown', 'untracked'].includes(value.retention as string);
}
