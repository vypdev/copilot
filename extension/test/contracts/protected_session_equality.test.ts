import { expect, it } from 'vitest';
import { sameProtectedSession } from '../../src/domain/session.ts';
import { CONNECTED } from '../fixtures/runtime.ts';

it('matches the complete validated protected record independently of key order', () => {
    expect(sameProtectedSession(Object.fromEntries(Object.entries(CONNECTED).reverse()), CONNECTED)).toBe(true);
    expect(sameProtectedSession({ ...CONNECTED, organizationId: '9' }, { ...CONNECTED, organizationId: '9' })).toBe(true);
});
it.each([
    { secret: 'synthetic_other_secret' }, { viewerId: '2' }, { viewerLogin: 'renamed' },
    { repositoryId: '8' }, { repository: 'octo/renamed' }, { organizationId: '9' },
])('different protected identity field %j cannot prove this exact saved connection', change => {
    expect(sameProtectedSession({ ...CONNECTED, ...change }, CONNECTED)).toBe(false);
});
it('missing organization and known personal ownership are separate canonical records', () => {
    expect(sameProtectedSession(CONNECTED, { ...CONNECTED, organizationId: null })).toBe(false);
    expect(sameProtectedSession({ ...CONNECTED, organizationId: null }, { ...CONNECTED, organizationId: '9' })).toBe(false);
});
it('malformed or future values on either side never establish protected persistence', () => {
    for (const value of [null, {}, { ...CONNECTED, schemaVersion: 99 }, { ...CONNECTED, privateExtra: true }]) {
        expect(sameProtectedSession(value, CONNECTED)).toBe(false); expect(sameProtectedSession(CONNECTED, value)).toBe(false);
    }
});
it('an inherited credential cannot substitute a missing own field even when the own-key count matches', () => {
    const { secret, ...identity } = CONNECTED;
    const value = Object.assign(Object.create({ secret }), identity, { organizationId: null });
    expect(sameProtectedSession(value, CONNECTED)).toBe(false);
});
