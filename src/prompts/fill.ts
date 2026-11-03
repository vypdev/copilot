/**
 * Replaces {{paramName}} placeholders in a template with values from params.
 * Missing keys are left as {{paramName}}.
 */
import {
    renderUntrustedField,
    createUntrustedContent,
    renderUntrustedContentVerbatim,
    UNTRUSTED_CONTENT_POLICY,
} from '../domain/security/untrusted_content';
import { BUGBOT_FRAMED_LIMITS, BugbotReviewCompletenessError } from '../domain/bugbot/framed_review';

const UNTRUSTED_TEMPLATE_KEYS = new Set([
    'commentBody',
    'description',
    'issueDescription',
    'question',
    'userComment',
    'userPrompt',
    'contextBlock',
    'findingsBlock',
    'parentBlock',
    'previousBlock',
    'diffBlock',
    'reviewConversationBlock',
    'previousRecommendation',
    'ignoreBlock',
    'verifyBlock',
]);

// These values are bounded by their domain builders before reaching the
// template. Keep the outer trust-boundary marker without collapsing the
// larger Bugbot context back to the generic 12K field limit.
const UNTRUSTED_TEMPLATE_LIMITS = new Map<string, number>([
    ['diffBlock', 70_000],
    ['reviewConversationBlock', 26_000],
    ['previousBlock', 50_000],
]);

export function fillTemplate(template: string, params: Record<string, string>, profile?: 'framed-v1'): string {
    const rendered = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const value = params[key];
        if (value == null) return `{{${key}}}`;
        if (!UNTRUSTED_TEMPLATE_KEYS.has(key)) return value;
        if (profile === 'framed-v1' && key === 'reviewConversationBlock') {
            const content = createUntrustedContent(value, `prompt.${key}`, BUGBOT_FRAMED_LIMITS.renderedUtf16);
            if (content.truncated) throw new BugbotReviewCompletenessError('renderedUtf16', BUGBOT_FRAMED_LIMITS.renderedUtf16 + 1, BUGBOT_FRAMED_LIMITS.renderedUtf16, 'UTF-16 code units', 'at-least');
            return renderUntrustedContentVerbatim(content);
        }
        return renderUntrustedField(
            value,
            `prompt.${key}`,
            UNTRUSTED_TEMPLATE_LIMITS.get(key),
        );
    });
    const containsUntrustedData = Object.keys(params).some((key) => UNTRUSTED_TEMPLATE_KEYS.has(key));
    return containsUntrustedData ? `${UNTRUSTED_CONTENT_POLICY}\n\n${rendered}` : rendered;
}
