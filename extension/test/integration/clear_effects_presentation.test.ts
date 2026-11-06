// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ClearEffects from '../../src/presentation/ClearEffects.svelte';
import { validClearFact, type ClearFact } from '../../src/domain/clear_fact.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { clearCopy } from '../../src/domain/clear_copy.ts';
import { historyCopy } from '../../src/domain/history_copy.ts';
import { clearSettled, clearSubmitted } from '../fixtures/clear_fact.ts';

it('a partial native issue discloses incompleteness and preserves accepted acknowledgement without inventing a sampled source', async () => {
    const fact: ClearFact = { ...clearSubmitted(), state: 'settled', result: 'unavailable', acknowledgement: 'accepted', observation: 'unavailable', incomplete: true };
    expect(validClearFact(fact)).toBe(true); const target = document.createElement('div'); document.body.append(target);
    const center = centerCopy('en', 'en'); const component = mount(ClearEffects, { target, props: { fact, center } }); flushSync();
    expect(target.textContent).toContain(clearCopy('en').incomplete); expect(target.textContent).toContain(historyCopy('en').issues.unavailable);
    expect(target.textContent).toContain(historyCopy('en').policyAcks.accepted); expect(target.textContent).not.toContain(historyCopy('en').text.sourceCurrent);
    expect(target.querySelector('button')).toBeNull(); await unmount(component); target.remove();
});
it('an explicitly sampled historical source loss is negative while the separately observed empty generation remains visible', async () => {
    const fact = { ...clearSettled(), sourceCurrentAtObservation: false }; const target = document.createElement('div'); document.body.append(target);
    const center = centerCopy('en', 'en'); const component = mount(ClearEffects, { target, props: { fact, center } }); flushSync();
    expect(target.textContent).toContain(clearCopy('en').observations.cleared); expect(target.querySelector('dl')?.lastElementChild?.textContent).toBe(center.messages.no);
    expect(target.querySelector('h3')?.textContent).toBe(clearCopy('en').submission); expect(target.querySelector('button')).toBeNull(); await unmount(component); target.remove();
});
it('an unsupported or prototype locale falls back to the entire immutable English copy', () => {
    const en = clearCopy('en'); expect(clearCopy('unknown')).toBe(en); expect(clearCopy('__proto__')).toBe(en);
    expect(Object.isFrozen(en)).toBe(true); expect(Object.isFrozen(en.states)).toBe(true); expect(Object.isFrozen(clearCopy('es').observations)).toBe(true);
});
