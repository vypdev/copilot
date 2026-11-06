import { expect, it } from 'vitest';
import { copySessionPreferences } from '../../src/domain/session_preferences.ts';
import { copySessionPreferenceReviewIntent } from '../../src/domain/session_preference_review.ts';
import { sessionPreferenceDocument } from '../fixtures/session_preferences.ts';
import { draftSessionPreferences, sessionPreferenceDraft } from '../../src/domain/session_preference_draft.ts';
import { resolveProfile } from '../../src/domain/profile_resolution.ts';
import { validResolvedProfile } from '../../src/domain/resolved_profile_validation.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { sessionPreferenceCopy } from '../../src/presentation/session_preference_copy.ts';

it('a native preference accessor that throws cannot escape the detached decoder or disclose its original exception', () => {
    const value = sessionPreferenceDocument(); Object.defineProperty(value, 'preferences', { enumerable: true, get: () => { throw new Error('private native accessor'); } });
    expect(copySessionPreferences(value)).toBeNull();
});
it('an authoring intent accessor that throws is refused without freezing or exposing the original caller', () => {
    const value = { type: 'replace' }; Object.defineProperty(value, 'preferences', { enumerable: true, get: () => { throw new Error('private intent accessor'); } });
    expect(copySessionPreferenceReviewIntent(value)).toBeNull(); expect(Object.isFrozen(value)).toBe(false);
});
it('serialization cannot substitute a private or different authoring payload after the initial validation', () => {
    const value = { type: 'replace', preferences: { density: 'compact' } }; let calls = 0;
    Object.defineProperty(value, 'toJSON', { value: () => ++calls === 1 ? value : { type: 'clear', privateTarget: 'must-not-copy' } });
    expect(copySessionPreferenceReviewIntent(value)).toBeNull(); expect(Object.isFrozen(value.preferences)).toBe(false);
});
it('a draft accessor that changes after validation cannot manufacture an unsupported compiled density', () => {
    const value = sessionPreferenceDraft({}); let reads = 0;
    Object.defineProperty(value, 'density', { enumerable: true, get: () => ++reads === 1 ? 'compact' : 'unsupported-density' });
    expect(draftSessionPreferences(value)).toBeNull();
});
it('an invented default positive pause cannot become a resolved native preference source', () => {
    const resolved = resolveProfile(DEFAULT_SETTINGS, undefined, DEFAULT_SETTINGS.center, { host: 'github.com', accountId: null, repositoryId: null, organizationId: null, sessionEpoch: null });
    expect(validResolvedProfile({ ...resolved, paused: true, pauseSources: ['default'] })).toBe(false);
});
it('unsupported locale names use the complete English resource while regional supported locales select their language', () => {
    expect(sessionPreferenceCopy('unknown')).toBe(sessionPreferenceCopy('en')); expect(sessionPreferenceCopy('fr-CA')).toBe(sessionPreferenceCopy('fr'));
});
