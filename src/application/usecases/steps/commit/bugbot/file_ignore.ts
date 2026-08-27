/** Max length for a single ignore pattern to avoid ReDoS from long/complex regex. */
const MAX_PATTERN_LENGTH = 500;

/** Max number of ignore patterns to process (avoids excessive regex compilation and work). */
const MAX_IGNORE_PATTERNS = 200;

/** Max cached compiled-regex entries (evict all when exceeded to keep memory bounded). */
const MAX_REGEX_CACHE_SIZE = 100;

const regexCache = new Map<string, RegExp[]>();

/**
 * Converts a glob-like pattern to a safe regex string (bounded length, collapsed stars to avoid ReDoS).
 */
function patternToRegexString(p: string): string | null {
    if (p.length > MAX_PATTERN_LENGTH) return null;
    const collapsed = p.replace(/\*+/g, '*');
    return collapsed
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\//g, '\\/');
}

/**
 * Returns compiled RegExp array for the given patterns (limited count, cached).
 */
function getCachedRegexes(ignorePatterns: string[]): RegExp[] {
    const trimmed = ignorePatterns.map((p) => p.trim()).filter(Boolean);
    const limited = trimmed.slice(0, MAX_IGNORE_PATTERNS);
    const key = JSON.stringify(limited);
    const cached = regexCache.get(key);
    if (cached !== undefined) return cached;

    const regexes: RegExp[] = [];
    for (const p of limited) {
        const regexPattern = patternToRegexString(p);
        if (regexPattern == null) continue;
        const regex = p.endsWith('/*')
            ? new RegExp(`^${regexPattern.replace(/\\\/\.\*$/, '(\\/.*)?')}$`)
            : new RegExp(`^${regexPattern}$`);
        regexes.push(regex);
    }
    if (regexCache.size >= MAX_REGEX_CACHE_SIZE) regexCache.clear();
    regexCache.set(key, regexes);
    return regexes;
}

/**
 * Returns true if the file path matches any of the ignore patterns (glob-style).
 * Used to exclude findings in test files, build output, etc.
 * Pattern length and count are capped; consecutive * are collapsed; compiled regexes are cached.
 */
export function fileMatchesIgnorePatterns(filePath: string | undefined, ignorePatterns: string[]): boolean {
    if (!filePath || ignorePatterns.length === 0) return false;
    const normalized = filePath.trim();
    if (!normalized) return false;

    const regexes = getCachedRegexes(ignorePatterns);
    return regexes.some((regex) => regex.test(normalized));
}
