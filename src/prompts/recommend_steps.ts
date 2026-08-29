/**
 * Prompt for recommending implementation steps from an issue (RecommendStepsUseCase).
 */
import { fillTemplate } from './fill';

const TEMPLATE = `Based on the following issue description, recommend concrete steps to implement or address this issue. Order the steps logically (e.g. setup, implementation, tests, docs). Keep each step clear and actionable.

{{projectContextInstruction}}

**Issue #{{issueNumber}} description:**
{{issueDescription}}

{{previousRecommendation}}

Provide a complete numbered list of recommended steps in **markdown** (use headings, lists, code blocks for commands or snippets) so it is easy to read. You can add brief sub-bullets per step if needed.

If the current description does not require any material change to the previous recommendation, output exactly \`NO_NEW_RECOMMENDATIONS\` and nothing else. Do not use that sentinel when there is no previous recommendation.`;

export type RecommendStepsParams = {
    projectContextInstruction: string;
    issueNumber: string;
    issueDescription: string;
    previousRecommendation?: string;
};

export function getRecommendStepsPrompt(params: RecommendStepsParams): string {
    return fillTemplate(TEMPLATE, {
        projectContextInstruction: params.projectContextInstruction,
        issueNumber: String(params.issueNumber),
        issueDescription: params.issueDescription,
        previousRecommendation: params.previousRecommendation
            ? `Previous recommendation (use only to detect whether the current plan is still valid):\n<previous-recommendation>\n${params.previousRecommendation}\n</previous-recommendation>`
            : 'There is no previous recommendation for this issue.',
    });
}
