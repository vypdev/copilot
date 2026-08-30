/**
 * Domain representation of content that originated outside Copilot's trusted
 * configuration. GitHub issue/PR data, repository files and agent responses
 * must remain data throughout the application.
 */
export declare const DEFAULT_UNTRUSTED_CONTENT_LIMIT = 12000;
export declare const UNTRUSTED_CONTENT_TRUNCATION_SUFFIX = "\n[untrusted content truncated]";
export interface UntrustedContent {
    readonly origin: string;
    readonly text: string;
    readonly originalLength: number;
    readonly truncated: boolean;
    readonly removedControlCharacters: boolean;
}
/**
 * Creates a bounded prompt representation without changing the source held by
 * the GitHub adapter. Format/control characters are removed only from the
 * prompt copy so invisible instructions cannot hide from the model.
 */
export declare function createUntrustedContent(raw: unknown, origin: string, maxLength?: number): UntrustedContent;
/**
 * Renders untrusted data as a clearly labelled data block. The terminator is
 * neutralized inside the payload, while the surrounding policy is supplied by
 * the trusted prompt builder.
 */
export declare function renderUntrustedContent(content: UntrustedContent): string;
export declare function renderUntrustedField(raw: unknown, origin: string, maxLength?: number): string;
/** Trusted policy text. It is intentionally constant and must precede data. */
export declare const UNTRUSTED_CONTENT_POLICY: string;
