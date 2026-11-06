import { expect, it } from 'vitest';
import { retiredCenterReview, observedSubmittedSettings, type SubmittedSettings } from '../../src/domain/center_retirement.ts';
import { decodeCenterPreview, type CenterDocument } from '../../src/domain/center_reply.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { publicSettingsReview } from '../../src/domain/settings_review_projection.ts';

const plan = decodeCenterPreview({ state: 'preview', operationId: 'a'.repeat(32), revision: 0, expiresAt: 10000, action: 'preferences',
    before: DEFAULT_SETTINGS, after: { ...DEFAULT_SETTINGS, density: 'compact' } });
if (plan?.state !== 'preview') throw new Error('invalid-reviewed-fixture');
const submitted: SubmittedSettings = { plan, owner: { role: 'editor', clientId: 'b'.repeat(32), controllerEpoch: 2, credentialEpoch: 4 } };
const observed: CenterDocument = { identity: submitted.owner, state: 'ready', settings: { ...plan.after, revision: 1 }, rollbackAvailable: true,
    lastOperation: { id: plan.operationId, beforeRevision: 0 } };
it('retirement with no review never fabricates an operation', () => expect(retiredCenterReview(null)).toBeNull());
it('retirement of an unsubmitted review makes it stale without inventing a saved outcome', () => {
    expect(retiredCenterReview(publicSettingsReview(submitted.plan, 'preview'))).toMatchObject({ state: 'stale' });
    expect(retiredCenterReview(publicSettingsReview(submitted.plan, 'preview'))).not.toHaveProperty('outcome');
});
it('retirement of a submitted confirmation preserves its delta and explicitly uncertain acknowledgement', () => {
    expect(retiredCenterReview(publicSettingsReview(submitted.plan, 'committing'))).toMatchObject({ state: 'unknown', action: 'preferences',
        outcome: { state: 'unknown', acknowledgement: 'unknown', observedRevision: null, observation: 'unavailable' } });
});
it.each(['saved', 'cancelled', 'unknown', 'conflict', 'stale', 'unavailable'] as const)('retirement preserves an already established %s review', state => {
    const review = publicSettingsReview(submitted.plan, state); expect(retiredCenterReview(review)).toBe(review);
});
it('readback without an attempted confirmation never promotes an unrelated receipt into a result', () => {
    expect(observedSubmittedSettings(null, observed)).toBeNull();
});
it.each([
    ['missing preferences', { ...observed, settings: null }], ['missing receipt', { ...observed, lastOperation: null }],
    ['different receipt', { ...observed, lastOperation: { ...observed.lastOperation!, id: 'c'.repeat(32) } }],
    ['different source revision', { ...observed, lastOperation: { ...observed.lastOperation!, beforeRevision: 1 } }],
    ['different saved values', { ...observed, settings: { ...observed.settings!, density: 'comfortable' as const } }],
])('readback of %s preserves uncertainty rather than certifying this attempted effect', (_name, observation) => {
    expect(observedSubmittedSettings(submitted, observation)).toBeNull();
});
it('exact readback establishes the saved fact without promoting the original missing acknowledgement', () => {
    expect(observedSubmittedSettings(submitted, observed)).toMatchObject({ state: 'saved', outcome: { state: 'committed', acknowledgement: 'unknown', revision: 1, current: true } });
});
it.each([
    ['controller epoch', { ...submitted.owner, controllerEpoch: 3 }],
    ['credential epoch', { ...submitted.owner, credentialEpoch: 5 }],
    ['new document with coincident numeric epochs', { ...submitted.owner, clientId: 'd'.repeat(32) }],
])('exact saved readback after a changed %s remains factual and is no longer a current-source receipt', (_name, identity) => {
    expect(observedSubmittedSettings(submitted, { ...observed, identity })).toMatchObject({ state: 'saved', outcome: { current: false, acknowledgement: 'unknown' } });
});
