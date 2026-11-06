import { vi } from 'vitest';
import { CollectionHistory } from '../../src/application/collection_history.ts';
import { HistoryControls } from '../../src/application/history_controls.ts';
import type { JournalStore } from '../../src/application/journal_ports.ts';
import type { CollectionPolicyStore } from '../../src/application/collection_policy_ports.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { decideControlledJournal } from '../../src/domain/controlled_journal.ts';
import { decideCollectionPolicy } from '../../src/domain/collection_policy.ts';
import type { JournalKind } from '../../src/domain/journal_facts.ts';
import { memoryStore } from './runtime.ts';
import { collectionSettings } from './collection_coordinator.ts';
import { activeCollectionPolicy } from './collection_policy.ts';

export const HISTORY_OWNER = 'a'.repeat(32);
/** Actual composed application ownership with deterministic transaction decisions; not a native acceptance driver. */
export function collectionHistoryFixture(active = false) {
    const memory = memoryStore(); memory.values.set(SETTINGS_KEY, collectionSettings(active, active));
    const policiesData = new Map<JournalKind, unknown>(); const documents = new Map<JournalKind, unknown>();
    if (active) { policiesData.set('diagnostics', activeCollectionPolicy()); policiesData.set('recents', activeCollectionPolicy('recents')); }
    const policies: CollectionPolicyStore = { execute: vi.fn<CollectionPolicyStore['execute']>(async (kind, command, current) => {
        if (command.type !== 'read' && current?.() !== true) return { state: 'stale' };
        const result = decideCollectionPolicy(kind, policiesData.get(kind), command); if (result.write) policiesData.set(kind, result.write); return result.result;
    }) };
    const journals: JournalStore = { execute: vi.fn<JournalStore['execute']>(async (kind, command, current, policyRevision) => {
        if (current && !current()) return { state: 'stale' };
        const result = decideControlledJournal(kind, documents.get(kind), policiesData.get(kind), command, policyRevision);
        if (result.write) documents.set(kind, result.write); return result.result;
    }) };
    let now = 1000; let sequence = 0; let epoch = 1;
    const ports = { now: vi.fn(() => now), identifier: vi.fn(() => (++sequence).toString(16).padStart(32, '0')), changed: vi.fn(),
        fence: vi.fn((owner: string) => owner === HISTORY_OWNER ? { controllerEpoch: epoch, credentialEpoch: 1 } : null) };
    const history = new CollectionHistory(memory.port, journals, policies, ports);
    const controls = new HistoryControls(history, policies, ports);
    return { ...memory, history, controls, ports, journals, policies, policiesData, documents,
        advance: (delta: number) => { now += delta; }, takeover: () => { epoch++; } };
}
