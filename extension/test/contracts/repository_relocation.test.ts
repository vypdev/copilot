import { expect, it } from 'vitest';
import { connectionIntent, connectionsView } from '../../src/domain/named_sessions.ts';
import { relocationSource, relocationTarget } from '../../src/domain/repository_relocation.ts';
import { relocationCopy } from '../../src/domain/relocation_copy.ts';
import { CONNECTED } from '../fixtures/runtime.ts';
const view = () => connectionsView({ schemaVersion: 1, revision: 1, selected: 'work', entries: [
    { id: 'work', name: 'Work', host: 'github.com', role: 'repository-read', connection: { ...CONNECTED, schemaVersion: 1 } },
] }, true);
it.each(['https://evil.test/a', 'a/b/c', '../x', './x', 'a/.', 'a/..', 'a/x\n', '', 'a'.repeat(201) + '/x', undefined, 7])('rejects a supplied unsafe new address %s before native verification', repository => {
    expect(connectionIntent({ type: 'select', id: 'work', repository })).toBe(false);
});
it('keeps removal/disconnect roles and native operands closed, with no secret/host/write privilege on recovery', () => {
    for (const change of [{ type: 'remove' }, { type: 'disconnect' }, { host: 'evil.test' }, { secret: CONNECTED.secret }, { role: 'write' }, { id: 'Bad' }, { command: 'apply' }]) {
        expect(connectionIntent({ type: 'select', id: 'work', repository: 'team/renamed', ...change })).toBe(false);
    }
    expect(connectionIntent({ type: 'select', id: 'work' })).toBe(true);
    expect(connectionIntent({ type: 'select', id: 'work', repository: 'a/b' })).toBe(true);
});
it('captures one immutable nonsecret session identity and follows new revisions without switching its numeric target', () => {
    const first = view(); const target = relocationTarget(first, 'work')!;
    expect(Object.isFrozen(target.entry)).toBe(true); expect(JSON.stringify(target)).not.toContain(CONNECTED.secret);
    expect(relocationSource({ ...first, revision: 2, entries: [{ ...first.entries[0], repository: 'team/new' }] }, target)).toMatchObject({ revision: 2, entry: { repository: 'team/new' } });
    for (const entries of [[], [{ ...first.entries[0], viewerId: '99' }], [{ ...first.entries[0], repositoryId: '99' }]]) {
        expect(relocationSource({ ...first, entries }, target)).toBeNull();
    }
});
it('unreadable, missing and retired session sources cannot manufacture a relocation draft', () => {
    for (const value of [null, { state: 'unknown' } as const, { state: 'unavailable' } as const]) expect(relocationTarget(value, 'work')).toBeNull();
    expect(relocationTarget(view(), 'missing')).toBeNull();
    expect(relocationSource(null, relocationTarget(view(), 'work')!)).toBeNull();
});
it.each(['en', 'es', 'fr', 'pt'] as const)('has a complete immutable %s review/recovery vocabulary', locale => {
    const value = relocationCopy(locale); expect(Object.keys(value)).toEqual(Object.keys(relocationCopy('en')));
    expect(Object.isFrozen(value)).toBe(true); expect(Object.values(value).every(text => text.length > 8)).toBe(true);
});
