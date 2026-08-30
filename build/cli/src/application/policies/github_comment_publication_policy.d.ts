/**
 * Model output is untrusted too. Keep useful Markdown, but neutralize the
 * GitHub automation surfaces that could create side effects when published.
 */
export declare function sanitizeAgentMarkdown(raw: unknown, maxLength?: number): string;
/**
 * Error messages can originate in an SDK or CLI and are not trusted publication
 * content. Keep a short diagnostic, but redact common credential formats before
 * applying the same GitHub-control protections used for agent output.
 */
export declare function sanitizePublishedError(raw: unknown): string;
export declare function escapeHtml(raw: unknown): string;
