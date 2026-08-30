/**
 * Prompt for the initial reply when a user opens a question/help issue.
 * Filled by the prompt provider; use getAnswerIssueHelpPrompt().
 */
import { fillTemplate } from './fill';

const TEMPLATE = `The user has just opened a question/help issue. Provide a helpful initial response to their question or request below. Be concise and actionable.

**Answer in this single response:** Give a complete, direct answer. Do not reply that you need to explore the repository, read documentation first, or gather more information—use the project (README, docs/, code, .cursor/rules) to answer now. For "how do I…" or tutorial-style questions (e.g. how to implement or configure this project), provide concrete steps or guidance based on the project's actual documentation and structure.

{{projectContextInstruction}}

**Issue description (user's question or request):**
{{description}}

Respond with a single JSON object containing an "answer" field with your reply. Format the answer in **markdown** (headings, lists, code blocks where useful) so it is easy to read. Do not include the question in your response.`;

export type AnswerIssueHelpParams = {
    description: string;
    projectContextInstruction: string;
};

export function getAnswerIssueHelpPrompt(params: AnswerIssueHelpParams): string {
    return fillTemplate(TEMPLATE, {
        description: params.description,
        projectContextInstruction: params.projectContextInstruction,
    });
}
