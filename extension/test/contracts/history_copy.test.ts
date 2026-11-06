import { expect, it } from 'vitest';
import { historyCopy } from '../../src/domain/history_copy.ts';
import { HISTORY_TEXT_KEYS } from '../../src/domain/history_copy_types.ts';

it.each(['en', 'es', 'fr', 'pt'])('provides a whole nonblank %s history resource without exporting a writable registry', locale => {
    const copy = historyCopy(locale); expect(Object.keys(copy.text)).toEqual(HISTORY_TEXT_KEYS); expect(Object.isFrozen(copy.text)).toBe(true);
    expect(Object.values(copy).flatMap(Object.values).every(value => typeof value === 'string' && value.trim())).toBe(true);
    if (locale !== 'en') expect(copy.text.review).not.toBe(historyCopy('en').text.review);
});
it('unsupported, incomplete, malformed and throwing translations fall back as a whole', () => {
    const english = historyCopy('en'); expect(historyCopy('ru')).toBe(english); expect(historyCopy(null)).toBe(english);
    for (const value of [null, {}, { es: null }, { es: {} }, { es: { ...english, issues: null } },
        { es: { ...english, text: { ...english.text, clear: ' ' } } }, { es: { ...english, text: { ...english.text, clear: false } } },
        { get es() { throw new Error('private'); } }]) expect(historyCopy('es', value)).toBe(english);
    expect(historyCopy('es', { es: english })).toBe(english);
});
