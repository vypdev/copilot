import { journalKind, type JournalKind } from './journal_facts.ts';
import { settingsOperationId } from './settings_operation.ts';
import { deepFreeze, jsonBytesWithin, keys, natural, record } from './value.ts';

export type CollectionMode = 'paused' | 'active';
export interface CollectionPolicy {
    readonly schemaVersion: 1; readonly kind: JournalKind; readonly revision: number; readonly mode: CollectionMode;
    readonly receipt: { readonly id: string; readonly beforeRevision: number; readonly settingsRevision: number } | null;
}
export type CollectionPolicyLoad = { readonly state: 'ready'; readonly policy: CollectionPolicy } | { readonly state: 'future' | 'corrupt' };
export type CollectionPolicyCommand = { readonly type: 'read' }
    | { readonly type: 'set'; readonly expectedRevision: number; readonly mode: CollectionMode; readonly operationId: string; readonly settingsRevision: number };
export type CollectionPolicyResult = { readonly state: 'ready' | 'written' | 'replayed'; readonly policy: CollectionPolicy }
    | { readonly state: 'invalid' | 'conflict' | 'future' | 'corrupt' | 'exhausted' | 'stale' }
    | { readonly state: 'unavailable'; readonly effect: 'not-started' | 'aborted' | 'unknown' };
export interface CollectionPolicyDecision { readonly result: CollectionPolicyResult; readonly write?: CollectionPolicy }

const mode = (value: unknown): value is CollectionMode => value === 'paused' || value === 'active';
export function validCollectionPolicy(kind: JournalKind, value: unknown): value is CollectionPolicy {
    if (!record(value) || !keys(value, ['schemaVersion', 'kind', 'revision', 'mode', 'receipt']) || Object.keys(value).length !== 5
        || value.schemaVersion !== 1 || value.kind !== kind || !natural(value.revision) || !mode(value.mode) || !jsonBytesWithin(value, 2048)) return false;
    if (value.revision === 0) return value.mode === 'paused' && value.receipt === null;
    return record(value.receipt) && keys(value.receipt, ['id', 'beforeRevision', 'settingsRevision']) && Object.keys(value.receipt).length === 3
        && settingsOperationId(value.receipt.id) && natural(value.receipt.beforeRevision)
        && value.receipt.beforeRevision + 1 === value.revision && natural(value.receipt.settingsRevision);
}
export function loadCollectionPolicy(kind: JournalKind, raw: unknown): CollectionPolicyLoad {
    try {
        if (raw === undefined) return { state: 'ready', policy: deepFreeze({ schemaVersion: 1, kind, revision: 0, mode: 'paused', receipt: null }) };
        if (record(raw) && natural(raw.schemaVersion) && raw.schemaVersion > 1) return { state: 'future' };
        if (!validCollectionPolicy(kind, raw)) return { state: 'corrupt' };
        const copy: unknown = JSON.parse(JSON.stringify(raw));
        return validCollectionPolicy(kind, copy) ? { state: 'ready', policy: deepFreeze(copy) } : { state: 'corrupt' };
    } catch { return { state: 'corrupt' }; }
}
export function validCollectionPolicyCommand(kind: unknown, value: unknown): value is CollectionPolicyCommand {
    if (!journalKind(kind) || !record(value)) return false;
    if (value.type === 'read') return keys(value, ['type']) && Object.keys(value).length === 1;
    return value.type === 'set' && keys(value, ['type', 'expectedRevision', 'mode', 'operationId', 'settingsRevision'])
        && Object.keys(value).length === 5 && natural(value.expectedRevision) && mode(value.mode)
        && settingsOperationId(value.operationId) && natural(value.settingsRevision);
}

/** Pure tentative decision; only native transaction completion can acknowledge its write. */
export function decideCollectionPolicy(kind: JournalKind, raw: unknown, command: CollectionPolicyCommand): CollectionPolicyDecision {
    try {
        if (!validCollectionPolicyCommand(kind, command)) return { result: { state: 'invalid' } };
        const loaded = loadCollectionPolicy(kind, raw);
        if (loaded.state !== 'ready') return { result: loaded };
        const before = loaded.policy;
        if (command.type === 'read') return { result: loaded };
        if (before.receipt?.id === command.operationId) {
            return { result: before.receipt.beforeRevision === command.expectedRevision && before.mode === command.mode
                && before.receipt.settingsRevision === command.settingsRevision ? { state: 'replayed', policy: before } : { state: 'invalid' } };
        }
        if (before.revision !== command.expectedRevision) return { result: { state: 'conflict' } };
        if (!natural(before.revision + 1)) return { result: { state: 'exhausted' } };
        const next = { ...before, revision: before.revision + 1, mode: command.mode,
            receipt: { id: command.operationId, beforeRevision: before.revision, settingsRevision: command.settingsRevision } };
        if (!validCollectionPolicy(kind, next)) return { result: { state: 'invalid' } };
        const policy = deepFreeze(JSON.parse(JSON.stringify(next)) as CollectionPolicy);
        return { result: { state: 'written', policy }, write: policy };
    } catch { return { result: { state: 'invalid' } }; }
}
