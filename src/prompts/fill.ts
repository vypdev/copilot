/**
 * Replaces {{paramName}} placeholders in a template with values from params.
 * Missing keys are left as {{paramName}}.
 */
import {
    renderUntrustedField,
    UNTRUSTED_CONTENT_POLICY,
} from '../domain/security/untrusted_content';

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

export function fillTemplate(template: string, params: Record<string, string>): string {
    const rendered = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const value = params[key];
        if (value == null) return `{{${key}}}`;
        if (!UNTRUSTED_TEMPLATE_KEYS.has(key)) return value;
        return renderUntrustedField(
            value,
            `prompt.${key}`,
            UNTRUSTED_TEMPLATE_LIMITS.get(key),
        );
    });
    const containsUntrustedData = Object.keys(params).some((key) => UNTRUSTED_TEMPLATE_KEYS.has(key));
    return containsUntrustedData ? `${UNTRUSTED_CONTENT_POLICY}\n\n${rendered}` : rendered;
}
