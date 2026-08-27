/**
 * Returns true if the file path matches any of the ignore patterns (glob-style).
 * Used to exclude findings in test files, build output, etc.
 * Pattern length and count are capped; consecutive * are collapsed; compiled regexes are cached.
 */
export declare function fileMatchesIgnorePatterns(filePath: string | undefined, ignorePatterns: string[]): boolean;
