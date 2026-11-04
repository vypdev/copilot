import { isSddDraftMinimumDiagnostic, normalizeSddValidationDiagnostic, type SddValidationDiagnostic } from '../sdd_validation_diagnostic';

const recovery = { minimum: 1800, observed: 'unavailable', attempts: 1 } as const;
const diagnostic: SddValidationDiagnostic = { reason: 'response-minimum', phase: 'response',
    facts: [{ detail: 'minimum-length', section: 0, expected: 1800 }] };

describe('bounded SDD minimum facts', () => {
    it.each([
        { minimum: 1, observed: 0, attempts: 1 },
        { minimum: 1800, observed: 'unavailable', attempts: 1 },
        { minimum: 1800, observed: 1799, attempts: 2 },
        { minimum: 100000, observed: 99999, attempts: 2 },
    ])('accepts safe minimum/observed/attempt boundaries %j', value => {
        expect(isSddDraftMinimumDiagnostic(value)).toBe(true);
    });

    it.each([
        { label: 'null', value: null }, { label: 'array', value: [] }, { label: 'primitive', value: 1 },
        { label: 'extra field', value: { ...recovery, response: 'PRIVATE_RESPONSE' } },
        { label: 'missing observed', value: { minimum: 1800, attempts: 1 } },
        ...[0, 100001, 1.5, Infinity, '1800', undefined].map(minimum => ({ label: `minimum ${String(minimum)}`, value: { ...recovery, minimum } })),
        ...[-1, 1800, 1.5, Infinity, '0', 'unknown'].map(observed => ({ label: `observed ${String(observed)}`, value: { ...recovery, observed } })),
        ...[0, 3, '1', undefined].map(attempts => ({ label: `attempt ${String(attempts)}`, value: { ...recovery, attempts } })),
    ])('rejects $label without accepting arbitrary facts', ({ value }) => {
        expect(isSddDraftMinimumDiagnostic(value)).toBe(false);
    });

    it.each([
        { ...diagnostic, phase: 'assembly' },
        { ...diagnostic, facts: [...diagnostic.facts, ...diagnostic.facts] },
        { ...diagnostic, facts: [{ ...diagnostic.facts[0], detail: 'response-shape' }] },
        { ...diagnostic, facts: [{ ...diagnostic.facts[0], section: 4 }] },
        { ...diagnostic, facts: [{ ...diagnostic.facts[0], row: 1 }] },
        { ...diagnostic, facts: [{ ...diagnostic.facts[0], expected: undefined }] },
        { ...diagnostic, facts: [{ ...diagnostic.facts[0], observed: 1800 }] },
    ])('rejects a minimum claim with inconsistent structural facts %j', value => {
        expect(() => normalizeSddValidationDiagnostic(value as SddValidationDiagnostic)).toThrow('minimum diagnostic');
    });

    it.each([undefined, 0, 1799])('copies and freezes a valid response minimum with observed %s', observed => {
        const input: SddValidationDiagnostic = { ...diagnostic,
            facts: [{ ...diagnostic.facts[0], ...(observed === undefined ? {} : { observed }) }] };
        const value = normalizeSddValidationDiagnostic(input);
        expect(value).toEqual(input); expect(value).not.toBe(input); expect(value.facts[0]).not.toBe(input.facts[0]);
        expect(Object.isFrozen(value)).toBe(true); expect(Object.isFrozen(value.facts)).toBe(true); expect(Object.isFrozen(value.facts[0])).toBe(true);
    });
});
