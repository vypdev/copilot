import { expect, it } from 'vitest';
import { reviewCopy } from '../../src/domain/review_copy.ts';

it('selects a complete immutable en/es/fr/pt resource including every operation outcome', () => {
    const english = reviewCopy('en');
    for (const locale of ['en', 'es', 'fr', 'pt']) {
        const copy = reviewCopy(locale); expect(Object.keys(copy)).toEqual(Object.keys(english));
        expect(Object.keys(copy.states)).toEqual(Object.keys(english.states));
        expect(Object.values(copy.states).every(value => value.length > 10)).toBe(true);
        expect(Object.isFrozen(copy)).toBe(true); expect(Object.isFrozen(copy.states)).toBe(true);
    }
    expect(reviewCopy('es').confirm).toBe('Confirmar cambio'); expect(reviewCopy('fr').confirm).toBe('Confirmer la modification');
    expect(reviewCopy('pt').confirm).toBe('Confirmar alteração');
});
it('honors explicit language, resolves native language only for auto, and falls back as a whole resource', () => {
    expect(reviewCopy('es', 'fr')).toBe(reviewCopy('es')); expect(reviewCopy('auto', 'FR-fr')).toBe(reviewCopy('fr'));
    expect(reviewCopy('PT-br')).toBe(reviewCopy('pt')); expect(reviewCopy('auto')).toBe(reviewCopy('en'));
    for (const value of [null, 1, '__proto__', 'unknown', 'constructor']) expect(reviewCopy(value)).toBe(reviewCopy('en'));
    expect(reviewCopy('auto', null)).toBe(reviewCopy('en'));
});
