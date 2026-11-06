import type { CollectionPolicyCommand, CollectionPolicyResult } from '../domain/collection_policy.ts';
import type { JournalKind } from '../domain/journal_facts.ts';
import type { CollectionPolicyStore } from './collection_policy_ports.ts';
import { reportPolicySubmission, type CollectionPolicyTrace } from './collection_policy_observation_ports.ts';

/** Observe invocation after the native port, including synchronous failure; never retry it. */
export async function attemptCollectionPolicy(store: CollectionPolicyStore, kind: JournalKind,
    command: Extract<CollectionPolicyCommand, { type: 'set' }>, current: () => boolean, trace?: CollectionPolicyTrace | null): Promise<CollectionPolicyResult> {
    let attempt: Promise<CollectionPolicyResult> | null = null;
    try { attempt = store.execute(kind, command, current); } catch { /* Canonical inspection remains a separate caller-owned step. */ }
    reportPolicySubmission(trace);
    try { return attempt ? await attempt : { state: 'unavailable', effect: 'unknown' }; }
    catch { return { state: 'unavailable', effect: 'unknown' }; }
}
