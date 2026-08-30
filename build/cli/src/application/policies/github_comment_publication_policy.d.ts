/**
 * Model output is untrusted too. Keep useful Markdown, but neutralize the
 * GitHub automation surfaces that could create side effects when published.
 */
export declare function sanitizeAgentMarkdown(raw: unknown, maxLength?: number): string;
export declare function escapeHtml(raw: unknown): string;
