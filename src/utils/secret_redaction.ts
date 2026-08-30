/** Redacts common credential formats from text before it reaches logs or GitHub. */
export function redactSecretLikeValues(value: string): string {
    return value
        .replace(/\bBearer\s+[^\s,;]+/giu, 'Bearer [REDACTED]')
        .replace(/\b(token|api[_-]?key|secret|password|client[_-]?secret)\s*[:=]\s*["']?[^\s,"']+/giu, '$1=[REDACTED]')
        .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+)\b/gu, '[REDACTED]');
}
