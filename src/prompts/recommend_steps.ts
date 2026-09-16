/**
 * Prompt for recommending implementation steps from an issue (RecommendStepsUseCase).
 */
import { fillTemplate } from './fill';

const TEMPLATE = `Based on the following issue description, produce a concise implementation plan. Return three to eight logically ordered steps (for example: contract, implementation, tests, and documentation). Each step needs a short action title and zero to two brief supporting details. Add one specific, verifiable acceptance criterion for the whole plan.

Write every human-readable field in {{targetLocale}}. Preserve code identifiers, repository-relative paths, refs, and commands verbatim. Do not write Markdown or headings inside fields; the product owns presentation. Echo \`outputLocale\` exactly as \`{{targetLocale}}\`.

{{projectContextInstruction}}

**Issue #{{issueNumber}} description:**
{{issueDescription}}

{{previousRecommendation}}

Return one JSON object with \`outputLocale\`, \`status\`, \`steps\`, and \`acceptance\`. When a material recommendation is needed, set \`status\` to \`recommendation\`, return \`steps\` as an array of objects with \`title\` and \`details\`, and return the verifiable criterion in \`acceptance\`.

If the current description does not require any material change to the previous recommendation, set \`status\` to \`unchanged\` and set both \`steps\` and \`acceptance\` to null. Do not return \`unchanged\` when there is no previous recommendation.`;

export type RecommendStepsParams = {
    projectContextInstruction: string;
    issueNumber: string;
    issueDescription: string;
    previousRecommendation?: string;
    previousRecommendationFormat?: 'structured' | 'structured-other-locale';
    targetLocale: string;
};

export function getRecommendStepsPrompt(params: RecommendStepsParams): string {
    return fillTemplate(TEMPLATE, {
        projectContextInstruction: params.projectContextInstruction,
        issueNumber: String(params.issueNumber),
        issueDescription: params.issueDescription,
        targetLocale: params.targetLocale,
        previousRecommendation: params.previousRecommendation
            ? `${previousRecommendationInstruction(params.previousRecommendationFormat)}\n<previous-recommendation>\n${params.previousRecommendation}\n</previous-recommendation>`
            : 'There is no previous recommendation for this issue.',
    });
}

function previousRecommendationInstruction(
    format: RecommendStepsParams['previousRecommendationFormat'],
): string {
    if (format === 'structured') {
        return 'Previous structured recommendation (use only to detect whether the current plan is still valid):';
    }
    if (format === 'structured-other-locale') {
        return 'Previous structured recommendation from another or unknown locale (return a complete structured replacement in the requested locale; do not return unchanged):';
    }
    return 'Previous structured recommendation from another or unknown locale (return a complete structured replacement in the requested locale; do not return unchanged):';
}
