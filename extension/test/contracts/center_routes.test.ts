import { expect, it } from 'vitest';
import { CENTER_ROUTES, centerLocationHash, localIdentifier, parseCenterLocation } from '../../src/domain/center_routes.ts';

it('bexh3-center-C09 resolves every closed center route and its safe unknown-route recovery', () => {
    expect(parseCenterLocation('')).toEqual({ route: 'overview' });
    expect(parseCenterLocation('#')).toEqual({ route: 'overview' });
    for (const route of CENTER_ROUTES) {
        expect(parseCenterLocation(`#/${route}`)).toEqual({ route });
        expect(centerLocationHash({ route })).toBe(`#/${route}`);
    }
    expect(parseCenterLocation('#/unknown')).toBeNull();
    expect(Object.isFrozen(parseCenterLocation('#/features'))).toBe(true);
});
it('only known feature and valid local profile identities qualify as detail destinations', () => {
    expect(parseCenterLocation('#/features/BEX-CENTER-01')).toEqual({ route: 'features', detail: 'BEX-CENTER-01' });
    expect(parseCenterLocation('#/profiles/review-team')).toEqual({ route: 'profiles', detail: 'review-team' });
    expect(centerLocationHash({ route: 'features', detail: 'BEX-NAV-01' })).toBe('#/features/BEX-NAV-01');
    expect(centerLocationHash({ route: 'profiles', detail: 'review-team' })).toBe('#/profiles/review-team');
    expect(Object.isFrozen(parseCenterLocation('#/profiles/review-team'))).toBe(true);
    for (const hash of ['#/features/BEX-UNKNOWN-01', '#/profiles/Bad-Id', '#/help/extra', '#/features/', '#/profiles/']) {
        expect(parseCenterLocation(hash)).toBeNull();
    }
});
it('bexhub-CTX-C05 rejects secret-bearing, executable, encoded and foreign destinations without forwarding input', () => {
    for (const hash of ['#/features?token=synthetic-secret', '#/setup?return=https://other.invalid', '#/profiles/%61',
        '#/profiles/../setup', '#/features//BEX-NAV-01', '#/features\n', '#/help#setup',
        'javascript:alert(1)', 'https://github.com/octo/example', '#/profiles/a\u0000', `#/${'a'.repeat(129)}`]) {
        expect(parseCenterLocation(hash)).toBeNull();
    }
});
it('validates programmatic route objects as strictly as external deep links', () => {
    for (const value of [null, [], {}, { route: false }, { route: 'overview', detail: 1 },
        { route: 'overview', returnUrl: 'https://other.invalid' }, { route: 'features', detail: 'BEX-UNKNOWN-01' }]) {
        expect(centerLocationHash(value)).toBeNull();
    }
    expect(localIdentifier('a')).toBe(true); expect(localIdentifier('a'.repeat(48))).toBe(true);
    for (const value of [null, 1, '', 'a'.repeat(49), 'a\n', '../a', 'a_b', 'A']) expect(localIdentifier(value)).toBe(false);
});
