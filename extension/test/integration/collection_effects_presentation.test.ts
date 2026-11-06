// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CollectionEffects from '../../src/presentation/CollectionEffects.svelte';
import { initialCollectionFact, validCollectionFact, type CollectionFact } from '../../src/domain/collection_fact.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { collectionCopy } from '../../src/domain/collection_copy.ts';

it('an incomplete closed historical result discloses missing phase detail and a retired source without adding a mutation control', async () => {
    const fact: CollectionFact = { ...initialCollectionFact('recents', 'stop', false), state: 'settled', result: 'unavailable', incomplete: true };
    expect(validCollectionFact(fact)).toBe(true); const target = document.createElement('div'); document.body.append(target);
    const center = centerCopy('en', 'en'); const component = mount(CollectionEffects, { target, props: { fact, center } }); flushSync();
    expect(target.textContent).toContain(collectionCopy('en').incomplete); expect(target.textContent).toContain(collectionCopy('en').notRequired);
    expect(target.querySelector('dl')?.lastElementChild?.textContent).toBe(center.messages.no); expect(target.querySelector('button')).toBeNull();
    await unmount(component); target.remove();
});
