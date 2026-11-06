import { BugbotReviewCompletenessError, isBugbotReviewBlockFacts } from '../framed_review';
import { ApplicationError } from '../../../application/errors/application_error';
import { renderApplicationErrorText } from '../../../application/policies/application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../../../application/policies/application_error_message_catalog';

const facts = new BugbotReviewCompletenessError('promptBytes', 524289, 524288).facts;
it('round-trips only closed measured review diagnostics through semantic errors', () => {
    expect(isBugbotReviewBlockFacts(facts)).toBe(true);
    const error = new ApplicationError('validation.evidence-unavailable', 'Blocked', { recovery: { id: 'bugbot-review-incomplete', variables: facts } });
    expect(error.retryable).toBe(false);
    expect(renderApplicationErrorText(error)).toContain('524,289');
    expect(renderApplicationErrorText(error)).toContain('UTF-8 bytes');
});
it.each([
    { profile: 'unknown' }, { resource: 'secret source' }, { countKind: 'maybe' }, { observed: -1 },
    { observed: NaN }, { observed: Infinity }, { observed: 1.5 }, { limit: -1 }, { limit: 999999999 },
    { unit: 'UTF-16 code units' }, { unknown: 'not allowed' },
])('rejects malformed or expanded review diagnostic %j', value => {
    const malformed = { ...facts, ...value };
    expect(isBugbotReviewBlockFacts(malformed)).toBe(false);
    expect(() => new ApplicationError('validation.evidence-unavailable', 'Blocked', { recovery: { id: 'bugbot-review-incomplete', variables: malformed as any } })).toThrow(TypeError);
});
it.each([null, [], {}, { ...facts, resource: undefined }])('rejects missing diagnostic facts %j', value => {
    expect(isBugbotReviewBlockFacts(value as any)).toBe(false);
});
it('shows lower-bound counts honestly in the operator error', () => {
    const blocked = new BugbotReviewCompletenessError('recoveredPatchBytes', 2097153, 2097152, 'UTF-8 bytes', 'at-least');
    const error = new ApplicationError('validation.evidence-unavailable', blocked.message, { recovery: { id: 'bugbot-review-incomplete', variables: blocked.facts } });
    expect(blocked.message).toContain('≥ 2097153');
    expect(renderApplicationErrorText(error)).toContain('≥ 2,097,153');
});

it('localizes resource names and units with the existing Spanish locale fallback', () => {
    const error = new ApplicationError('validation.evidence-unavailable', 'Blocked', { recovery: { id: 'bugbot-review-incomplete', variables: facts } });
    const text = renderApplicationErrorText(error, resolveStaticApplicationErrorCatalog('es-MX').message);
    expect(text).toContain('Tamaño del prompt final');
    expect(text).toContain('bytes UTF-8');
    expect(text).toContain('No');
});
