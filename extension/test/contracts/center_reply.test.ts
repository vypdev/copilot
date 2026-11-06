import { expect, it } from 'vitest';
import { centerPayload, decodeCenterIdentity, decodeCenterDocument, decodeCenterPreview, decodeCenterOutcome } from '../../src/domain/center_reply.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';

const id = 'a'.repeat(32); const source = 'b'.repeat(64);
const identity = () => ({ state: 'ready', clientId: id, role: 'editor', controllerEpoch: 0, credentialEpoch: 0 });
const document = () => ({ ...identity(), loaded: { state: 'ready', settings: DEFAULT_SETTINGS, migrated: false }, rollbackAvailable: false, lastOperation: null });
const preview = () => ({ state: 'preview', operationId: id, revision: 0, expiresAt: 1000, action: 'appearance', before: DEFAULT_SETTINGS,
    after: { ...DEFAULT_SETTINGS, theme: 'dark' } });

it('binds bounded native replies to the installed build and preserves unknown keys for closed decoding', () => {
    expect(centerPayload({ sourceTree: source, ...identity() }, source)).toEqual(identity());
    expect(centerPayload({ sourceTree: 'unbundled', state: 'ready' }, 'unbundled')).toEqual({ state: 'ready' });
    expect(centerPayload({ sourceTree: source, unknown: undefined }, source)).toHaveProperty('unknown');
    for (const [value, expected] of [[null, source], [[], source], [{ sourceTree: source }, 'c'.repeat(64)],
        [{ sourceTree: 'bad' }, 'bad'], [{ sourceTree: source, text: 'é'.repeat(70 * 1024) }, source]] as const) {
        expect(centerPayload(value, expected)).toBeNull();
    }
});
it('admits editor/observer identities only with complete native handles and natural epochs', () => {
    expect(decodeCenterIdentity(identity())).toEqual({ clientId: id, role: 'editor', controllerEpoch: 0, credentialEpoch: 0 });
    expect(decodeCenterIdentity({ ...identity(), role: 'observer' })?.role).toBe('observer');
    for (const value of [null, [], {}, { ...identity(), extra: undefined }, { ...identity(), state: 'stale' },
        { ...identity(), clientId: 'foreign' }, { ...identity(), role: 'owner' }, { ...identity(), controllerEpoch: -1 },
        { ...identity(), credentialEpoch: NaN }, { ...identity(), credentialEpoch: undefined }]) expect(decodeCenterIdentity(value)).toBeNull();
});
it('copies ready snapshots and exposes future/corrupt/migration states without inventing an editable default', () => {
    const input = document(); const ready = decodeCenterDocument(input)!;
    expect(ready.state).toBe('ready'); expect(ready.settings).not.toBe(DEFAULT_SETTINGS); expect(Object.isFrozen(ready.settings)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    for (const [state, expected] of [['future', 'future'], ['invalid', 'corrupt']] as const) {
        expect(decodeCenterDocument({ ...input, loaded: { ...input.loaded, state } })).toMatchObject({ state: expected, settings: null });
    }
    expect(decodeCenterDocument({ ...input, loaded: { ...input.loaded, migrated: true } })?.state).toBe('migration-required');
    expect(decodeCenterDocument({ ...input, loaded: { ...input.loaded, settings: { ...DEFAULT_SETTINGS, revision: 1 } },
        lastOperation: { id, beforeRevision: 0 }, rollbackAvailable: true })?.lastOperation).toEqual({ id, beforeRevision: 0 });
});
it('rejects inconsistent settings, migration flags or receipts instead of relaying private data', () => {
    const input = document();
    for (const value of [null, {}, { ...input, extra: 'private' }, { ...input, role: 'owner' }, { ...input, loaded: [] },
        { ...input, loaded: { ...input.loaded, extra: true } }, { ...input, loaded: { ...input.loaded, settings: { ...DEFAULT_SETTINGS, secret: 'private' } } },
        { ...input, loaded: { ...input.loaded, migrated: 1 } }, { ...input, rollbackAvailable: 1 },
        { ...input, loaded: { ...input.loaded, state: 'unknown' } }, { ...input, lastOperation: undefined },
        { ...input, lastOperation: { id, beforeRevision: 0, extra: true } }, { ...input, lastOperation: { id: 'bad', beforeRevision: 0 } },
        { ...input, lastOperation: { id, beforeRevision: -1 } }, { ...input, lastOperation: { id, beforeRevision: 0 } },
        { ...input, loaded: { ...input.loaded, state: 'future', migrated: true } },
        { ...input, loaded: { ...input.loaded, state: 'invalid' }, rollbackAvailable: true },
        { ...input, loaded: { ...input.loaded, state: 'future', settings: { ...DEFAULT_SETTINGS, revision: 1 } }, lastOperation: { id, beforeRevision: 0 } },
    ]) expect(decodeCenterDocument(value)).toBeNull();
});
it('accepts complete changed previews and every closed nonpreview result without retaining a caller reference', () => {
    const input = preview(); const decoded = decodeCenterPreview(input)!;
    expect(decoded).toEqual(input); expect(Object.isFrozen(decoded)).toBe(true); expect(Object.isFrozen(input)).toBe(false);
    for (const state of ['unchanged', 'denied', 'stale', 'conflict', 'unavailable', 'future', 'corrupt', 'busy', 'migration-required']) {
        expect(decodeCenterPreview({ state })).toEqual({ state });
    }
    for (const reason of ['invalid-input', 'profile-invalid', 'profile-capacity', 'profile-not-found', 'profile-conflict', 'future-schema', 'pause-protected', 'no-rollback']) {
        expect(decodeCenterPreview({ state: 'invalid', reason })).toEqual({ state: 'invalid', reason });
    }
});
it('rejects malformed or unchanged previews and unknown native error details', () => {
    const input = preview();
    for (const value of [null, {}, { state: 'private-provider-error', text: 'private' }, { state: 'invalid', reason: 'private' },
        { state: 'invalid', reason: 'invalid-input', extra: true }, { state: 'busy', extra: undefined },
        { ...input, extra: true }, { ...input, operationId: 'bad' }, { ...input, revision: -1 }, { ...input, expiresAt: NaN },
        { ...input, action: 'execute-command' }, { ...input, before: {} }, { ...input, after: {} },
        { ...input, before: { ...DEFAULT_SETTINGS, revision: 1 } }, { ...input, after: { ...DEFAULT_SETTINGS, revision: 1 } },
        { ...input, after: structuredClone(DEFAULT_SETTINGS) }]) expect(decodeCenterPreview(value)).toBeNull();
});
it('decodes observed commits, receipt replays, uncertainty and closed terminal results distinctly', () => {
    for (const acknowledgement of ['accepted', 'unknown']) {
        const committed = { state: 'committed', revision: 1, acknowledgement, current: false }; expect(decodeCenterOutcome(committed)).toEqual(committed);
        for (const observation of ['unchanged', 'changed', 'unavailable']) for (const observedRevision of [null, 0, 3]) {
            const unknown = { state: 'unknown', acknowledgement, observation, observedRevision }; expect(decodeCenterOutcome(unknown)).toEqual(unknown);
        }
    }
    expect(decodeCenterOutcome({ state: 'replayed', revision: 1 })).toEqual({ state: 'replayed', revision: 1 });
    for (const state of ['conflict', 'invalid', 'stale', 'unavailable', 'expired', 'cancelled', 'pending', 'denied']) expect(decodeCenterOutcome({ state })).toEqual({ state });
});
it('rejects malformed outcome facts, unsupported acknowledgement states and private extra fields', () => {
    const committed = { state: 'committed', revision: 1, acknowledgement: 'accepted', current: true };
    const unknown = { state: 'unknown', observedRevision: null, acknowledgement: 'unknown', observation: 'unavailable' };
    for (const value of [null, {}, { ...committed, extra: true }, { ...committed, revision: -1 }, { ...committed, acknowledgement: 'pending' },
        { ...committed, current: undefined }, { state: 'replayed', revision: -1 }, { state: 'replayed', revision: 1, extra: true },
        { ...unknown, extra: true }, { ...unknown, observedRevision: -1 }, { ...unknown, acknowledgement: 'pending' },
        { ...unknown, observation: 'private' }, { state: 'denied', text: 'private' }, { state: 'provider-error' }]) expect(decodeCenterOutcome(value)).toBeNull();
});
