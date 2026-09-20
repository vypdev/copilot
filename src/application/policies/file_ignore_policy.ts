/** Max length for a single ignore pattern to avoid ReDoS from long/complex regex. */
const MAX_PATTERN_LENGTH = 500;

/** Max number of ignore patterns to process (avoids excessive regex compilation and work). */
const MAX_IGNORE_PATTERNS = 200;

/** Max cached compiled-regex entries (evict all when exceeded to keep memory bounded). */
const MAX_REGEX_CACHE_SIZE = 100;

const regexCache = new Map<string, RegExp[]>();

/** Converts a glob-like pattern to a bounded regex string. */
function patternToRegexString(pattern: string): string | null {
    if (pattern.length > MAX_PATTERN_LENGTH) return null;
    const collapsed = pattern.replace(/\*+/g, '*');
    return collapsed
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\//g, '\\/');
}

function getCachedRegexes(ignorePatterns: readonly string[]): RegExp[] {
    const trimmed = ignorePatterns.map((pattern) => pattern.trim()).filter(Boolean);
    const limited = trimmed.slice(0, MAX_IGNORE_PATTERNS);
    const key = JSON.stringify(limited);
    const cached = regexCache.get(key);
    if (cached !== undefined) return cached;

    const regexes: RegExp[] = [];
    for (const pattern of limited) {
        const regexPattern = patternToRegexString(pattern);
        if (regexPattern == null) continue;
        const regex = pattern.endsWith('/*')
            ? new RegExp(`^${regexPattern.replace(/\\\/\.\*$/, '(\\/.*)?')}$`)
            : new RegExp(`^${regexPattern}$`);
        regexes.push(regex);
    }
    if (regexCache.size >= MAX_REGEX_CACHE_SIZE) regexCache.clear();
    regexCache.set(key, regexes);
    return regexes;
}

/** Returns whether a repository-relative path matches any bounded glob-like ignore pattern. */
export function fileMatchesIgnorePatterns(
    filePath: string | undefined,
    ignorePatterns: readonly string[],
): boolean {
    if (!filePath || ignorePatterns.length === 0) return false;
    const normalized = filePath.trim();
    if (!normalized) return false;
    return getCachedRegexes(ignorePatterns).some((regex) => regex.test(normalized));
}
