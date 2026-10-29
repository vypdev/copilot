import { vi } from 'vitest';
import { CollectionCoordinator } from '../../src/application/collection_coordinator.ts';
import type { CollectionPolicyStore } from '../../src/application/collection_policy_ports.ts';
import { SETTINGS_KEY, SettingsRepository } from '../../src/application/settings_repository.ts';
import { decideCollectionPolicy } from '../../src/domain/collection_policy.ts';
import type { JournalKind } from '../../src/domain/journal_facts.ts';
import { DEFAULT_SETTINGS, type Settings } from '../../src/domain/settings.ts';
import { memoryStore } from './runtime.ts';

export function collectionSettings(diagnostics = false, recents = false, revision = 0): Settings {
    return { ...DEFAULT_SETTINGS, revision, center: { ...DEFAULT_SETTINGS.center, diagnostics, recents } };
}
/** Application contract fixture; native database/engine acceptance is a separate campaign. */
export function collectionFixture(initial: Settings = DEFAULT_SETTINGS) {
    const memory = memoryStore(); memory.values.set(SETTINGS_KEY, initial);
    const values = new Map<JournalKind, unknown>(); const events: string[] = []; let sequence = 0;
    const policies: CollectionPolicyStore = { execute: vi.fn<CollectionPolicyStore['execute']>(async (kind, command, current) => {
        events.push(`${kind}:${command.type}`);
        if (command.type === 'set' && !current?.()) return { state: 'stale' };
        const decision = decideCollectionPolicy(kind, values.get(kind), command);
        if (decision.write) values.set(kind, decision.write);
        return decision.result;
    }) };
    const ports = { settings: vi.fn(() => repository.read()), identifier: vi.fn(() => (++sequence).toString(16).padStart(32, '0')),
        writerIdle: vi.fn(() => true), changed: vi.fn() };
    const coordinator = new CollectionCoordinator(policies, ports);
    const repository = new SettingsRepository(memory.port, coordinator);
    const set = memory.port.set;
    vi.mocked(set).mockImplementation(async (key, value) => { events.push('preferences:set'); memory.values.set(key, structuredClone(value)); });
    return { ...memory, values, events, policies, ports, coordinator, repository };
}
