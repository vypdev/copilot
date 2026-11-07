import { createUntrustedContent } from '../../domain/security/untrusted_content';
import { redactKnownEnvironmentSecrets, redactSecretLikeValues } from '../../utils/secret_redaction';

/**
 * Model output is untrusted too. Keep useful Markdown, but neutralize the
 * GitHub automation surfaces that could create side effects when published.
 */
export function sanitizeAgentMarkdown(raw: unknown, maxLength: number | 'complete' = 12_000): string {
    if (typeof raw !== 'string') return '';
    const redacted = redactKnownEnvironmentSecrets(redactSecretLikeValues(raw));
    // Complete projections have already passed their owner's capacity gate.
    const limit = maxLength === 'complete' ? Math.max(12_000, redacted.normalize('NFKC').length) : maxLength;
    const bounded = createUntrustedContent(
        redacted,
        'agent.comment.output',
        limit,
    ).text;
    return neutralizeGithubControls(bounded);
}

/**
 * Error messages can originate in an SDK or CLI and are not trusted publication
 * content. Keep a short diagnostic, but redact common credential formats before
 * applying the same GitHub-control protections used for agent output.
 */
export function sanitizePublishedError(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    const withoutStack = raw.split(/\n\s+at\s+/u, 1)[0];
    return sanitizeAgentMarkdown(withoutStack, 2_000)
        .replace(/\[REDACTED\]/gu, '[redacted]');
}

export function escapeHtml(raw: unknown): string {
    return String(raw ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function neutralizeGithubControls(value: string): string {
    return value
        .replace(/<!--/g, '&lt;!--')
        .replace(/-->/g, '--&gt;')
        .replace(/(^|\n)([ \t]*)::/g, '$1$2:\u200b:')
        .replace(/(^|\n)([ \t]*)\/(?!\/)/g, '$1$2\u200b/')
        .replace(/@(?=[a-zA-Z0-9][a-zA-Z0-9-])/g, '@\u200b');
}
