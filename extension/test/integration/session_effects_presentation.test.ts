// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SessionEffects from '../../src/presentation/SessionEffects.svelte';
import HistoryEntries from '../../src/presentation/HistoryEntries.svelte';
import { sessionCopy } from '../../src/domain/session_copy.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { historyCopy } from '../../src/domain/history_copy.ts';
import { validSessionFact, type SessionFact } from '../../src/domain/session_fact.ts';
import { validJournalSnapshot } from '../../src/domain/local_journal.ts';

it('an incomplete admitted session with no observed native attempt discloses both limits instead of invented success or controls', async () => {
    const fact: SessionFact = { kind: 'session-operation', action: 'connect', state: 'settled', result: 'unavailable', effects: [], incomplete: true };
    expect(validSessionFact(fact)).toBe(true); const target = document.createElement('div'); document.body.append(target);
    const component = mount(SessionEffects, { target, props: { fact, locale: 'en' } }); flushSync(); const copy = sessionCopy('en');
    expect(target.textContent).toContain(copy.incomplete); expect(target.textContent).toContain(copy.empty); expect(target.textContent).toContain(copy.results.unavailable);
    expect(target.querySelector('button')).toBeNull(); expect(target.querySelector('ol')).toBeNull(); await unmount(component); target.remove();
});
it('a retained session row renders its own action and ordered partial effects with no authority or private target', async () => {
    const fact: SessionFact = { kind: 'session-operation', action: 'revoke-all', state: 'settled', result: 'unavailable', incomplete: false, effects: [
        { ordinal: 1, effect: 'retire-active', state: 'settled', acknowledgement: 'accepted', observation: 'different' },
        { ordinal: 2, effect: 'remove-vault', state: 'settled', acknowledgement: 'unknown', observation: 'committed' },
    ] };
    const snapshot = { schemaVersion: 1 as const, kind: 'diagnostics' as const, epoch: 0, revision: 1, nextSequence: 2, lastTime: 100, entries: [{ sequence: 1, at: 100, fact }] };
    expect(validJournalSnapshot('diagnostics', snapshot)).toBe(true); const target = document.createElement('div'); document.body.append(target);
    const component = mount(HistoryEntries, { target, props: { snapshot, copy: historyCopy('es'), center: centerCopy('es', 'en') } }); flushSync(); const copy = sessionCopy('es');
    expect(target.querySelector('h3')?.textContent).toBe(copy.actions['revoke-all']); expect(target.querySelectorAll('[data-session-effects] li')).toHaveLength(2);
    expect(target.textContent).toContain(copy.observations.different); expect(target.textContent).toContain(copy.observations.committed);
    expect(target.querySelector('button')).toBeNull(); expect(target.querySelector('[data-operation-target]')).toBeNull(); await unmount(component); target.remove();
});
