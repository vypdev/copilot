const SENSITIVE_PATTERNS: readonly RegExp[] = [
    /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/g,
    /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}\b/gi,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[^\s"']{12,}["']?/gi,
];

/** Redacts credential-shaped values before agent output reaches logs or SCM. */
export function redactSensitiveText(value: string): string {
    return SENSITIVE_PATTERNS.reduce(
        (redacted, pattern) => redacted.replace(pattern, '[REDACTED_SECRET]'),
        value,
    );
}
