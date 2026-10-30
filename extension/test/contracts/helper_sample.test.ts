import { expect, it } from 'vitest';
import { HELPER_IDS, helperId, helperReason, helperSnapshot, helperSampleIntent, snapshotHelperIntent, latestHelperReasons, type HelperSampleIntent, type HelperSnapshot } from '../../src/domain/helper_sample.ts';

const sourceTree = 'a'.repeat(64);
const event = { featureId: 'runtime-health', code: 'mount-failed', scope: 'active-at-observation' } as const;
const ready = (): Extract<HelperSampleIntent, { state: 'ready' }> => ({ state: 'ready', sourceTree, generation: 2, credentialEpoch: 3, settingsRevision: 4, health: { blocked: ['runtime-health'], events: [event] } });
it('the source ring is detached before async open and cannot alias or freeze the content caller', () => {
    const input = { ...ready(), health: { blocked: ['runtime-health'], events: [{ ...event }] } }; const copy = snapshotHelperIntent(input)!;
    input.health.blocked.splice(0); input.health.events[0].code = 'refresh-failed' as never;
    expect(copy).toMatchObject({ health: { blocked: ['runtime-health'], events: [event] } }); expect(Object.isFrozen(copy)).toBe(true);
    expect(Object.isFrozen(copy.state === 'ready' && copy.health.events[0])).toBe(true); expect(Object.isFrozen(input)).toBe(false);
});
it('a captured empty ring is valid evidence and differs from an explicit unavailable source', () => {
    const empty = { ...ready(), health: { blocked: [], events: [] } }; expect(helperSampleIntent(empty)).toBe(true);
    expect(snapshotHelperIntent({ state: 'unavailable', sourceTree })).toEqual({ state: 'unavailable', sourceTree });
    expect(snapshotHelperIntent(empty)).not.toEqual(snapshotHelperIntent({ state: 'unavailable', sourceTree }));
});
it('the complete100-event ring and two independently blocked helpers stay bounded', () => {
    const health = { blocked: [...HELPER_IDS], events: Array.from({ length: 100 }, () => event) }; expect(helperSnapshot(health)).toBe(true);
    expect(helperSnapshot({ ...health, events: [...health.events, event] })).toBe(false); expect(helperSnapshot({ ...health, blocked: ['runtime-health', 'runtime-health'] })).toBe(false);
});
it.each([
    ['private helper', { featureId: 'private' }], ['raw error', { error: 'private' }], ['unknown code', { code: 'private' }],
    ['live scope', { scope: 'current' }], ['original timestamp', { at: 1 }], ['URL', { url: 'https://github.com/private/repo' }],
] as const)('a %s cannot enter a closed helper reason', (_label, patch) => { expect(helperReason({ ...event, ...patch })).toBe(false); });
it('missing, nonstring and unregistered helper facts cannot be admitted', () => {
    for (const value of [null, {}, [], { ...event, code: 1 }, { ...event, featureId: 1 }, { ...event, scope: null }]) expect(helperReason(value)).toBe(false);
    expect(helperId('runtime-health')).toBe(true); expect(helperId('center-shortcuts')).toBe(true); expect(helperId('private')).toBe(false); expect(helperId(null)).toBe(false);
});
it.each([
    ['expanded snapshot', { blocked: [], events: [], private: true }], ['missing events', { blocked: [] }], ['nonarray blocked', { blocked: {}, events: [] }],
    ['unknown blocked helper', { blocked: ['private'], events: [] }], ['too many blocked entries', { blocked: ['runtime-health', 'center-shortcuts', 'private'], events: [] }],
    ['nonarray reasons', { blocked: [], events: {} }], ['private reason', { blocked: [], events: [{ ...event, secret: 'private' }] }],
] as const)('rejects %s without silently filtering it into healthy evidence', (_label, value) => { expect(helperSnapshot(value)).toBe(false); });
it('sample containers must be complete objects with a fixed source-build digest', () => {
    for (const value of [null, {}, [], { ...ready(), sourceTree: 1 }, { ...ready(), sourceTree: 'a'.repeat(63) }, { ...ready(), sourceTree: sourceTree + '\n' }]) expect(snapshotHelperIntent(value)).toBeNull();
});
it.each([
    ['future state', { state: 'future' }], ['missing lease generation', { generation: undefined }], ['invalid generation', { generation: -1 }],
    ['invalid credential epoch', { credentialEpoch: '3' }], ['invalid configuration revision', { settingsRevision: Number.MAX_SAFE_INTEGER + 1 }],
    ['private extra source', { url: 'private' }], ['missing ring', { health: undefined }],
] as const)('rejects %s instead of allowing another source receipt', (_label, patch) => { expect(snapshotHelperIntent({ ...ready(), ...patch })).toBeNull(); });
it('an unavailable source has no reconstructed ring or lease data', () => {
    expect(helperSampleIntent({ state: 'unavailable', sourceTree, health: { blocked: [], events: [] } })).toBe(false);
    expect(helperSampleIntent({ state: 'unavailable', sourceTree, generation: 1 })).toBe(false);
});
it('hostile getters, serialization failures and an unstable snapshot fail closed', () => {
    expect(snapshotHelperIntent(Object.defineProperty({}, 'sourceTree', { get() { throw new Error('private'); } }))).toBeNull();
    const value = ready(); Object.defineProperty(value.health, 'toJSON', { value() { throw new Error('private'); } }); expect(snapshotHelperIntent(value)).toBeNull();
    const unstable = ready(); let serializations = 0; Object.defineProperty(unstable.health, 'toJSON', { value() { return ++serializations === 1 ? { blocked: [], events: [] } : { private: true }; } });
    expect(snapshotHelperIntent(unstable)).toBeNull();
});
it('only the latest reason for each registered helper is projected in fixed order and without source selectors', () => {
    const newer = { featureId: 'runtime-health', code: 'cleanup-failed', scope: 'retired-at-observation' } as const;
    const shortcuts = { featureId: 'center-shortcuts', code: 'refresh-failed', scope: 'active-at-observation' } as const;
    const health: HelperSnapshot = { blocked: [], events: [event, shortcuts, newer] }; const reasons = latestHelperReasons(health);
    expect(reasons).toEqual([newer, shortcuts]); expect(reasons[0]).not.toBe(newer); expect(Object.isFrozen(reasons[0])).toBe(true);
    expect(JSON.stringify(reasons)).not.toMatch(/sourceTree|generation|credentialEpoch|settingsRevision/); expect(latestHelperReasons({ blocked: [], events: [] })).toEqual([]);
});
