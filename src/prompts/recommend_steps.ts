/**
 * Prompt for recommending implementation steps from an issue (RecommendStepsUseCase).
 */
import { fillTemplate } from './fill';

const TEMPLATE = `Based on the following issue description, recommend concrete steps to implement or address this issue. Order the steps logically (e.g. setup, implementation, tests, docs). Keep each step clear and actionable.

Write every human-readable sentence in {{targetLocale}}. Preserve code identifiers, paths, refs, commands, and URLs verbatim. Echo \`outputLocale\` exactly as \`{{targetLocale}}\`.

{{projectContextInstruction}}

**Issue #{{issueNumber}} description:**
{{issueDescription}}

{{previousRecommendation}}

Return one JSON object with \`outputLocale\`, \`status\`, and \`steps\`. When a material recommendation is needed, set \`status\` to \`recommendation\` and put a complete numbered list in Markdown in \`steps\` (headings, lists, and code blocks are allowed). You can add brief sub-bullets per step if needed.

If the current description does not require any material change to the previous recommendation, set \`status\` to \`unchanged\` and \`steps\` to null. Do not return \`unchanged\` when there is no previous recommendation.`;

export type RecommendStepsParams = {
    projectContextInstruction: string;
    issueNumber: string;
    issueDescription: string;
    previousRecommendation?: string;
    targetLocale: string;
};

export function getRecommendStepsPrompt(params: RecommendStepsParams): string {
    return fillTemplate(TEMPLATE, {
        projectContextInstruction: params.projectContextInstruction,
        issueNumber: String(params.issueNumber),
        issueDescription: params.issueDescription,
        targetLocale: params.targetLocale,
        previousRecommendation: params.previousRecommendation
            ? `Previous recommendation (use only to detect whether the current plan is still valid):\n<previous-recommendation>\n${params.previousRecommendation}\n</previous-recommendation>`
            : 'There is no previous recommendation for this issue.',
    });
}
