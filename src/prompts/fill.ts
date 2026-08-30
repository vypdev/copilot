/**
 * Replaces {{paramName}} placeholders in a template with values from params.
 * Missing keys are left as {{paramName}}.
 */
import { renderUntrustedField } from '../domain/security/untrusted_content';

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
    'previousRecommendation',
    'ignoreBlock',
    'verifyBlock',
]);

export function fillTemplate(template: string, params: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const value = params[key];
        if (value == null) return `{{${key}}}`;
        if (!UNTRUSTED_TEMPLATE_KEYS.has(key)) return value;
        return renderUntrustedField(value, `prompt.${key}`);
    });
}
