import { expect, it, vi } from 'vitest';
import { isEligibleGitHubUrl } from '../../src/domain/eligibility.ts';

it('bexh1-foundation-C09 allows canonical GitHub URLs without reading a browser environment', () => {
    for (const url of ['https://github.com', 'https://github.com/', 'https://github.com?tab=stars',
        'https://github.com/vypdev/copilot/pull/702#discussion', 'https://github.com/owner/repo/blob/main/caf%C3%A9.ts']) {
        expect(isEligibleGitHubUrl(url)).toBe(true);
    }
});
it('bexh1-foundation-C10 rejects deceptive origins, ports, credentials and ambiguous URL syntax', () => {
    for (const url of ['http://github.com/a', 'https://api.github.com/a', 'https://github.com.evil.invalid/a',
        'https://user@github.com/a', 'https://github.com:443/a', 'https://github.com@evil.invalid/a',
        'https://github.com\\@evil.invalid/a', ' https://github.com/a', 'https://github.com/a\n',
        'https://github.com/a%2Fb', 'https://github.com/a%5Cb', 'https://github.com/a%00b',
        'https://github.com/%broken', 'https://github.com/./a', 'https://github.com/a/../settings']) {
        expect(isEligibleGitHubUrl(url), url).toBe(false);
    }
});
it('bexh1-foundation-C11 rejects direct and encoded protected account/auth routes', () => {
    for (const route of ['login', 'signup', 'password_reset', 'sessions', 'login/oauth/authorize', 'settings/tokens',
        'settings/billing', 'account/security', 'apps/app/installations/new', '%73ettings/tokens']) {
        expect(isEligibleGitHubUrl(`https://github.com/${route}`)).toBe(false);
    }
});
it('bexh1-foundation-C12 excludes repository administration while preserving normal object/source routes', () => {
    for (const route of ['owner/repo/settings', 'owner/repo/security/advisories', 'owner/repo/billing', 'orgs/org/settings']) {
        expect(isEligibleGitHubUrl(`https://github.com/${route}`)).toBe(false);
    }
    for (const route of ['owner/repo/issues/702', 'owner/repo/pull/702', 'owner/repo/blob/main/settings.ts']) {
        expect(isEligibleGitHubUrl(`https://github.com/${route}`)).toBe(true);
    }
});
it('rejects native organization/enterprise SSO, SAML consumption and legacy session routes', () => {
    for (const route of ['orgs/organization/sso', 'orgs/organization/sso/sign_up', 'enterprises/enterprise/sso',
        'orgs/organization/saml/consume', 'enterprises/enterprise/saml/consume', 'orgs/organization/credential-authorizations', 'user_sessions']) {
        expect(isEligibleGitHubUrl(`https://github.com/${route}`)).toBe(false);
    }
});
it('the actual content entry performs only a guard for both eligible and protected URLs', async () => {
    const request = vi.fn(() => { throw new Error('unexpected request'); });
    vi.stubGlobal('fetch', request);
    try {
        for (const href of ['https://github.com/owner/repo', 'https://github.com/settings/tokens']) {
            vi.resetModules(); vi.stubGlobal('location', { href });
            await import('../../src/infrastructure/content_entry.ts');
        }
        expect(request).not.toHaveBeenCalled();
        await import('../../src/infrastructure/background_entry.ts');
    } finally { vi.unstubAllGlobals(); }
});
