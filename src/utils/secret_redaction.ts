/** Redacts common credential formats from text before it reaches logs or GitHub. */
export function redactSecretLikeValues(value: string): string {
    return value
        .replace(/\bBearer\s+[^\s,;]+/giu, 'Bearer [REDACTED]')
        .replace(/\b(token|api[_-]?key|secret|password|client[_-]?secret)\s*[:=]\s*["']?[^\s,"']+/giu, '$1=[REDACTED]')
        .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+)\b/gu, '[REDACTED]');
}

/** Redacts exact credential values known to the current process, including non-standard token formats. */
export function redactKnownEnvironmentSecrets(
    value: string,
    environment: NodeJS.ProcessEnv = process.env,
): string {
    let redacted = value;
    for (const [name, secret] of Object.entries(environment)) {
        if (!secret || secret.length < 8 || !/(?:TOKEN|SECRET|PASSWORD|API[_-]?KEY|PRIVATE[_-]?KEY)$/iu.test(name)) continue;
        redacted = redacted.split(secret).join('[REDACTED]');
    }
    return redacted;
}
