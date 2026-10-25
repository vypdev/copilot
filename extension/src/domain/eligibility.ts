const PROTECTED = new Set([
    'login', 'logout', 'signup', 'join', 'password_reset', 'password', 'sessions', 'session',
    'settings', 'account', 'accounts', 'billing', 'security', 'two-factor', 'sudo',
    'oauth', 'auth', 'authentication', 'applications', 'tokens', 'personal-access-tokens', 'user_sessions',
    'apps', 'organizations',
]);

/** Operates on canonical URL text without browser/DOM/Node dependencies or effects. */
export function isEligibleGitHubUrl(value: string): boolean {
    if (/[\s\\\p{Cc}]/u.test(value)) return false;
    const match = /^https:\/\/github\.com(\/[^?#]*)?(?:[?#].*)?$/u.exec(value);
    if (!match) return false;
    let segments: string[];
    try {
        segments = (match[1] ?? '/').split('/').filter(Boolean).map(segment => decodeURIComponent(segment).toLowerCase());
    } catch {
        return false;
    }
    if (segments.some(segment => /[\\/\p{Cc}]/u.test(segment) || segment === '.' || segment === '..')) return false;
    if (PROTECTED.has(segments[0])) return false;
    return !['settings', 'security', 'billing', 'sso', 'saml', 'credential-authorizations'].includes(segments[2]);
}
