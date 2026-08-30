import { createUntrustedContent } from '../../domain/security/untrusted_content';

/**
 * Model output is untrusted too. Keep useful Markdown, but neutralize the
 * GitHub automation surfaces that could create side effects when published.
 */
export function sanitizeAgentMarkdown(raw: unknown, maxLength = 12_000): string {
    if (typeof raw !== 'string') return '';
    const bounded = createUntrustedContent(raw, 'agent.comment.output', maxLength).text;
    return neutralizeGithubControls(bounded);
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
