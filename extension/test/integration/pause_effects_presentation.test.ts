// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PauseEffects from '../../src/presentation/PauseEffects.svelte';
import CurrentOperationPanel from '../../src/presentation/CurrentOperationPanel.svelte';
import HistoryEntries from '../../src/presentation/HistoryEntries.svelte';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { historyCopy } from '../../src/domain/history_copy.ts';
import { operationCopy } from '../../src/domain/operation_copy.ts';
import { pauseObservationCopy } from '../../src/domain/pause_observation_copy.ts';
import { validPauseFact, type PauseFact } from '../../src/domain/pause_fact.ts';
import type { CurrentOperationView } from '../../src/domain/current_operation.ts';
import type { JournalSnapshot } from '../../src/domain/local_journal.ts';
import { pauseAdopted, pauseReviewed, pauseRunning, pauseSettled } from '../fixtures/pause_fact.ts';

const mounts: ReturnType<typeof mount>[] = []; afterEach(async () => { for (const host of mounts.splice(0)) await unmount(host); document.body.replaceChildren(); });
function target() { const value = document.createElement('div'); document.body.append(value); return value; }
function view(fact: PauseFact, current = true): CurrentOperationView {
    return { phase: 'ready', current, value: { state: 'current', operation: { family: 'pauses', stage: fact.state, fact, target: null, sourceCurrent: current, firstObserved: 1000, retention: 'untracked' } } };
}
it.each(['en', 'es', 'fr', 'pt'])('the %s current and retained views localize native facts without making history into an operation control', locale => {
    const center = centerCopy(locale); const copy = pauseObservationCopy(locale); const fact = pauseSettled(); const read = vi.fn(); const panel = target(); const history = target();
    mounts.push(mount(CurrentOperationPanel, { target: panel, props: { center, view: view(fact), read, available: true, expanded: true } }));
    const snapshot: JournalSnapshot = { schemaVersion: 1, kind: 'diagnostics', epoch: 0, revision: 1, nextSequence: 2, lastTime: 1000, entries: [{ sequence: 1, at: 1000, fact }] };
    mounts.push(mount(HistoryEntries, { target: history, props: { center, copy: historyCopy(locale), snapshot } })); flushSync();
    for (const node of [panel, history]) {
        for (const label of [copy.actions[fact.action], copy.results.committed, copy.observations.committed, historyCopy(locale).acknowledgements.accepted, copy.submitted]) expect(node.textContent).toContain(label);
        expect(node.textContent).not.toContain('operationId'); expect(node.querySelector('[data-pause-effects] button')).toBeNull();
    }
    expect(panel.textContent).toContain(copy.states.settled); expect(panel.querySelector('[data-pause-effects] h3')).not.toBeNull(); expect(history.querySelector('[data-pause-effects] h4')).not.toBeNull();
    (panel.querySelector('button') as HTMLButtonElement).click(); expect(read).toHaveBeenCalledOnce(); expect(history.querySelector('button')).toBeNull();
});
it('a running native attempt exposes an acknowledgement without prematurely presenting a canonical effect', () => {
    const fact: PauseFact = { ...pauseRunning(), submitted: true, acknowledgement: 'accepted' }; const center = centerCopy('en'); const node = target();
    mounts.push(mount(CurrentOperationPanel, { target: node, props: { center, view: view(fact), read: vi.fn(), available: true } })); flushSync();
    expect(node.textContent).toContain(pauseObservationCopy('en').states.running); expect(node.textContent).toContain(historyCopy('en').acknowledgements.accepted);
    expect(node.textContent).not.toContain(pauseObservationCopy('en').results.committed); expect(node.querySelector('[data-pause-result]')?.textContent).toBe(pauseObservationCopy('en').results.pending);
});
it('known native effects stay visible beside a separately unconfirmed primary result and negative historical source', () => {
    const fact: PauseFact = { ...pauseSettled(), result: 'unknown', sourceCurrentAtObservation: false }; expect(validPauseFact(fact)).toBe(true);
    const center = centerCopy('es'); const node = target(); mounts.push(mount(CurrentOperationPanel, { target: node, props: { center, view: view(fact, false), read: vi.fn(), available: true } })); flushSync();
    expect(node.textContent).toContain(pauseObservationCopy('es').results.unknown); expect(node.textContent).toContain(pauseObservationCopy('es').observations.committed);
    expect(node.textContent).toContain(operationCopy('es').historical); expect(node.querySelector('[data-operation-target]')).toBeNull();
    expect(node.querySelector('[data-pause-effects] dl')?.lastElementChild?.textContent).toBe(center.messages.no);
});
it('adoption explicitly discloses no native write or acknowledgement and does not offer a repeat action', () => {
    const center = centerCopy('fr'); const fact = pauseAdopted(); const node = target();
    mounts.push(mount(PauseEffects, { target: node, props: { fact, center } })); flushSync();
    const copy = pauseObservationCopy('fr'); expect(node.textContent).toContain(copy.adoption); expect(node.textContent).toContain(copy.results.reconciled);
    expect(node.querySelector('[data-pause-submission]')?.textContent).toBe(copy.notObserved); expect(node.textContent).not.toContain(historyCopy('fr').acknowledgements.accepted); expect(node.querySelector('button')).toBeNull();
});
it('an incomplete observation is explicit without inventing a source sample or native attempt', () => {
    const center = centerCopy('pt'); const fact: PauseFact = { ...pauseSettled(), submitted: false, incomplete: true, sourceCurrentAtObservation: null, result: 'unavailable' }; expect(validPauseFact(fact)).toBe(true);
    const node = target(); mounts.push(mount(PauseEffects, { target: node, props: { fact, center } })); flushSync();
    expect(node.textContent).toContain(pauseObservationCopy('pt').incomplete); expect(node.textContent).not.toContain(historyCopy('pt').text.sourceCurrent);
    expect(node.querySelector('[data-pause-submission]')?.textContent).toBe(pauseObservationCopy('pt').notObserved);
});
it('reviewed and cancelled views stay distinct from native write facts', async () => {
    const center = centerCopy('en'); for (const fact of [pauseReviewed(), { ...pauseReviewed(), state: 'cancelled', result: 'cancelled' } as PauseFact]) {
        const node = target(); const host = mount(CurrentOperationPanel, { target: node, props: { center, view: view(fact), read: vi.fn(), available: false } }); flushSync();
        expect(node.textContent).toContain(pauseObservationCopy('en').states[fact.state]); expect((node.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
        expect(node.querySelector('[data-pause-submission]')?.textContent).toBe(pauseObservationCopy('en').notObserved); await unmount(host); node.remove();
    }
});
it('unsupported and prototype locales use one complete immutable fallback', () => {
    const en = pauseObservationCopy('en'); for (const locale of ['de', '__proto__', 'constructor']) expect(pauseObservationCopy(locale)).toBe(en);
    expect(Object.isFrozen(en)).toBe(true); expect(Object.isFrozen(en.actions)).toBe(true); expect(Object.isFrozen(pauseObservationCopy('es').observations)).toBe(true);
});
