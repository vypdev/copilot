import { expect, it, vi } from 'vitest';
import { helperCompositionFixture as fixture } from '../fixtures/helper_composition.ts';
import { IndexedCollectionPolicyStore } from '../../src/adapters/browser/collection_policy_store.ts';
import { IndexedJournalStore } from '../../src/adapters/browser/journal_store.ts';
import { decideCollectionPolicy } from '../../src/domain/collection_policy.ts';
import { decideControlledJournal } from '../../src/domain/controlled_journal.ts';
import type { JournalKind } from '../../src/domain/journal_facts.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';

it('the actual background owner reports consenting retention, then real reviewed stop/clear retires its exact helper ticket without a new row', async () => {
    // Deterministic transaction-adapter contracts retain the real coordinator, writer, gateway and native composition; not native IndexedDB evidence.
    const policies = new Map<JournalKind, unknown>([['diagnostics', activeCollectionPolicy()]]); const journals = new Map<JournalKind, unknown>();
    vi.spyOn(IndexedCollectionPolicyStore.prototype, 'execute').mockImplementation(async (kind, command, current) => {
        if (command.type !== 'read' && current?.() !== true) return { state: 'stale' };
        const value = decideCollectionPolicy(kind, policies.get(kind), command); if (value.write) policies.set(kind, value.write); return value.result;
    });
    vi.spyOn(IndexedJournalStore.prototype, 'execute').mockImplementation(async (kind, command, current, revision) => {
        if (current && !current()) return { state: 'stale' };
        const value = decideControlledJournal(kind, journals.get(kind), policies.get(kind), command, revision); if (value.write) journals.set(kind, value.write); return value.result;
    });
    const f = await fixture(true, true); f.key(); await vi.waitFor(() => expect(f.api.tabs.create).toHaveBeenCalledOnce());
    await vi.waitFor(async () => expect(await f.read()).toMatchObject({ state: 'sample', retention: [{ helper: 'runtime-health', retention: 'stored' }] }));
    const client = await f.call({ version: 1, method: 'center.open' }, f.optionSender);
    const headers = { version: 1, clientId: client.clientId, controllerEpoch: client.controllerEpoch, credentialEpoch: client.credentialEpoch };
    const stop = await f.call({ ...headers, method: 'center.collection.preview', kind: 'diagnostics', action: 'stop' }, f.optionSender); expect(stop.state).toBe('preview');
    expect(await f.call({ ...headers, method: 'center.collection.confirm', operationId: stop.operationId }, f.optionSender)).toMatchObject({ reason: 'done' });
    const clear = await f.call({ ...headers, method: 'center.history.clear.preview', kind: 'diagnostics' }, f.optionSender); expect(clear.state).toBe('preview');
    expect(await f.call({ ...headers, method: 'center.history.clear.confirm', operationId: clear.operationId }, f.optionSender)).toMatchObject({ state: 'observed-cleared' });
    expect(await f.read()).toMatchObject({ state: 'sample', retention: [{ helper: 'runtime-health', retention: 'untracked' }] });
    expect(journals.get('diagnostics')).toMatchObject({ entries: [], epoch: 1 }); expect(f.provider).not.toHaveBeenCalled(); expect(f.api.permissions.request).not.toHaveBeenCalled();
});
