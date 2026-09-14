export const DEFAULT_REPOSITORY_LOCALE = 'en-US';
export const MAX_LOCALE_TAG_LENGTH = 255;

export type LocaleScope = 'repository' | 'issue' | 'pull-request';

export interface LocaleProfile {
    readonly repository: string;
    readonly issue: string;
    readonly pullRequest: string;
    readonly issueOverride?: string;
    readonly pullRequestOverride?: string;
}

export class InvalidLocaleTagError extends Error {
    readonly input: string;

    constructor(input: string) {
        super(`Invalid locale tag: ${JSON.stringify(input)}.`);
        this.name = 'InvalidLocaleTagError';
        this.input = input;
    }
}

export interface LocaleTagNormalization {
    readonly canonical: string;
    readonly usedLegacySeparator: boolean;
}

/**
 * Canonicalizes one BCP-47 locale. Underscores are accepted for the documented
 * migration window, but every value leaving this boundary uses hyphens.
 */
export function canonicalizeLocaleTag(value: unknown): string {
    return normalizeLocaleTag(value).canonical;
}

export function normalizeLocaleTag(value: unknown): LocaleTagNormalization {
    if (typeof value !== 'string') throw new InvalidLocaleTagError(String(value));
    const trimmed = value.trim();
    if (Array.from(trimmed).some(character => {
        const codePoint = character.charCodeAt(0);
        return codePoint <= 31 || codePoint === 127;
    })) throw new InvalidLocaleTagError(value);
    const usedLegacySeparator = trimmed.includes('_');
    const normalized = trimmed.replace(/_/gu, '-');
    if (!normalized || normalized.length > MAX_LOCALE_TAG_LENGTH) {
        throw new InvalidLocaleTagError(value);
    }
    if (/^x(?:-|$)/iu.test(normalized) || /^und(?:-|$)/iu.test(normalized)) {
        throw new InvalidLocaleTagError(value);
    }
    try {
        const [canonical] = Intl.getCanonicalLocales(normalized);
        if (!canonical) throw new InvalidLocaleTagError(value);
        return Object.freeze({ canonical, usedLegacySeparator });
    } catch (error) {
        if (error instanceof InvalidLocaleTagError) throw error;
        throw new InvalidLocaleTagError(value);
    }
}

export function resolveLocaleProfile(
    repositoryLocale: unknown,
    issueLocale: unknown = '',
    pullRequestLocale: unknown = '',
): LocaleProfile {
    const repository = canonicalizeLocaleTag(
        typeof repositoryLocale === 'string' && repositoryLocale.trim()
            ? repositoryLocale
            : DEFAULT_REPOSITORY_LOCALE,
    );
    const issueOverride = optionalLocale(issueLocale);
    const pullRequestOverride = optionalLocale(pullRequestLocale);
    return Object.freeze({
        repository,
        issue: issueOverride ?? repository,
        pullRequest: pullRequestOverride ?? repository,
        ...(issueOverride ? { issueOverride } : {}),
        ...(pullRequestOverride ? { pullRequestOverride } : {}),
    });
}

export function localeForScope(profile: LocaleProfile, scope: LocaleScope): string {
    if (scope === 'issue') return profile.issue;
    if (scope === 'pull-request') return profile.pullRequest;
    return profile.repository;
}

export function isLocaleProfile(value: unknown): value is LocaleProfile {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const candidate = value as Partial<LocaleProfile>;
    try {
        const resolved = resolveLocaleProfile(
            candidate.repository,
            candidate.issueOverride ?? '',
            candidate.pullRequestOverride ?? '',
        );
        return candidate.repository === resolved.repository
            && candidate.issue === resolved.issue
            && candidate.pullRequest === resolved.pullRequest
            && candidate.issueOverride === resolved.issueOverride
            && candidate.pullRequestOverride === resolved.pullRequestOverride;
    } catch {
        return false;
    }
}

export function localeLanguagesMatch(left: string, right: string): boolean {
    return baseLanguage(canonicalizeLocaleTag(left)) === baseLanguage(canonicalizeLocaleTag(right));
}

export function baseLanguage(locale: string): string {
    return new Intl.Locale(canonicalizeLocaleTag(locale)).language.toLowerCase();
}

function optionalLocale(value: unknown): string | undefined {
    if (value == null || value === '') return undefined;
    if (typeof value !== 'string') throw new InvalidLocaleTagError(String(value));
    return value.trim() ? canonicalizeLocaleTag(value) : undefined;
}
