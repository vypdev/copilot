// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CurrentOperationPanel from '../../src/presentation/CurrentOperationPanel.svelte';
import HistoryEntries from '../../src/presentation/HistoryEntries.svelte';
import { apiCacheCopy } from '../../src/domain/api_cache_copy.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { historyCopy } from '../../src/domain/history_copy.ts';
import { operationCopy } from '../../src/domain/operation_copy.ts';
import { decideJournal } from '../../src/domain/local_journal.ts';
import type { ApiCacheFact } from '../../src/domain/api_cache.ts';
import type { CurrentOperationView } from '../../src/domain/current_operation.ts';

const mounted: Record<string, unknown>[] = [];
afterEach(async () => { for (const app of mounted.splice(0)) await unmount(app); document.body.replaceChildren(); });
it('the four complete cache resources render only closed current/history facts, preserving native scope and outcome language', async () => {
    const english = apiCacheCopy('en'); expect(apiCacheCopy('__proto__')).toBe(english);
    for (const locale of ['en', 'es', 'fr', 'pt'] as const) {
        const copy = apiCacheCopy(locale); expect(Object.keys(copy)).toEqual(Object.keys(english)); expect(Object.keys(copy.states)).toEqual(Object.keys(english.states));
        expect(Object.keys(copy.outcomes)).toEqual(Object.keys(english.outcomes)); expect(Object.isFrozen(copy.states)).toBe(true); expect(Object.isFrozen(copy.outcomes)).toBe(true);
        expect(Object.values(copy).filter(value => typeof value === 'string').every(value => value.trim().length > 0)).toBe(true);
        expect(Object.values(copy.states).every(value => value.trim().length > 0)).toBe(true); expect(Object.values(copy.outcomes).every(value => value.trim().length > 0)).toBe(true);
        const fact: ApiCacheFact = { kind: 'cache-operation', action: 'clear-api-cache', state: 'cleared' };
        const snapshot = decideJournal('diagnostics', undefined, { type: 'append', epoch: 0, now: 1000, at: 1000, fact }).write!;
        const node = document.createElement('div'); document.body.append(node);
        const app = mount(HistoryEntries, { target: node, props: { snapshot, copy: historyCopy(locale), center: centerCopy(locale) } }); mounted.push(app); flushSync();
        expect(node.querySelector('h3')?.textContent).toBe(copy.title); expect(node.querySelector('[data-cache-fact]')?.textContent).toBe(copy.states.cleared);
        expect(node.textContent).toContain(copy.scope); expect(node.textContent).not.toContain('clear-api-cache'); expect(node.querySelector('button')).toBeNull();
        await unmount(app); mounted.pop(); node.remove();
    }
});
it('unknown cache metadata directs read-only recovery to Privacy instead of recommending a settings write or another clear', () => {
    const center = centerCopy('en'); const copy = apiCacheCopy('en'); const read = vi.fn();
    const view: CurrentOperationView = { phase: 'ready', current: true, value: { state: 'current', operation: { family: 'cache', stage: 'unknown',
        fact: { kind: 'cache-operation', action: 'clear-api-cache', state: 'unknown' }, target: null, sourceCurrent: false, firstObserved: 1000, retention: 'untracked' } } };
    mounted.push(mount(CurrentOperationPanel, { target: document.body, props: { view, center, read, available: true, expanded: true } })); flushSync();
    expect(document.querySelector('[data-operation-stage]')?.textContent).toBe(copy.states.unknown); expect(document.body.textContent).toContain(copy.unknownHelp);
    expect(document.body.textContent).not.toContain(operationCopy('en').uncertain); expect(document.querySelector('a[href="#/privacy"]')?.textContent).toBe(center.routes.privacy);
    const buttons = [...document.querySelectorAll('button')]; expect(buttons).toHaveLength(1); expect(buttons[0].textContent).toBe(operationCopy('en').read);
    buttons[0].click(); expect(read).toHaveBeenCalledOnce();
});
