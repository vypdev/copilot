/**
 * Prompt for the Think use case (answer to @mention in issue/PR comment).
 */
import { fillTemplate } from './fill';

const TEMPLATE = `You are a helpful assistant. Answer the following question concisely in {{targetLocale}}, using the context below when relevant. Format your answer in **markdown** (headings, lists, code blocks where useful) so it is easy to read. Do not include the question in your response. Preserve code identifiers, paths, refs, commands, and URLs verbatim.

{{projectContextInstruction}}
{{contextBlock}}Question: {{question}}`;

export type ThinkParams = {
    projectContextInstruction: string;
    contextBlock: string;
    question: string;
    targetLocale?: string;
};

export function getThinkPrompt(params: ThinkParams): string {
    return fillTemplate(TEMPLATE, {
        projectContextInstruction: params.projectContextInstruction,
        contextBlock: params.contextBlock,
        question: params.question,
        targetLocale: params.targetLocale ?? 'en-US',
    });
}
