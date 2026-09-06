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

export function fillTemplate(template: string, params: Record<string, string>): string {
    const rendered = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const value = params[key];
        if (value == null) return `{{${key}}}`;
        if (!UNTRUSTED_TEMPLATE_KEYS.has(key)) return value;
        return renderUntrustedField(value, `prompt.${key}`);
    });
    const containsUntrustedData = Object.keys(params).some((key) => UNTRUSTED_TEMPLATE_KEYS.has(key));
    return containsUntrustedData ? `${UNTRUSTED_CONTENT_POLICY}\n\n${rendered}` : rendered;
}
