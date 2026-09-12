import { hasVisibleCommentContent } from '../../domain/comment_content_policy';
import type { ResultPublicationRecord, ResultPublicationSections } from './result_publication_contracts';
import { sanitizeAgentMarkdown, sanitizePublishedError } from './github_comment_publication_policy';

export function renderResultSections(results: readonly ResultPublicationRecord[]): ResultPublicationSections {
    const renderedSteps: string[] = [];
    const reminders: string[] = [];
    const errors: string[] = [];
    let stepIndex = 0;

    for (const result of results) {
        stepIndex = appendSteps(renderedSteps, result, stepIndex);
        reminders.push(...result.reminders
            .map(reminder => sanitizeAgentMarkdown(reminder))
            .filter(hasVisibleCommentContent));
        errors.push(...result.errors
            .map(renderPublishedApplicationError)
            .filter(hasVisibleCommentContent));
    }

    return {
        content: renderedSteps.length > 0 ? `${renderedSteps.join('\n\n')}\n` : '',
        footer: reminders.length > 0 ? `\n## Reminder\n\n${reminders.map((reminder, index) => `${index + 1}. ${reminder}`).join('\n')}\n` : '',
        errors: errors.length > 0
            ? `\n## Errors Found\n\n${errors.map((error, index) => `${index + 1}. ${error}\n`).join('\n')}\nCheck your project configuration, if everything is okay consider [opening an issue](https://github.com/vypdev/copilot/issues/new/choose).\n`
            : '',
    };
}

function renderPublishedApplicationError(view: ResultPublicationRecord['errors'][number]): string {
    return [
        `**Impact:** ${sanitizePublishedError(view.impact)}`,
        `   **Cause (\`${view.code}\`):** ${sanitizePublishedError(view.cause)}`,
        `   **Action:** ${sanitizePublishedError(view.action)}`,
        `   **Retained state:** ${sanitizePublishedError(view.retainedState)}`,
        `   **Reference:** \`${view.reference}\``,
    ].join('\n');
}

function appendSteps(renderedSteps: string[], result: ResultPublicationRecord, stepIndex: number): number {
    for (const step of result.steps) {
        if (!step.trim()) continue;
        const safeStep = sanitizeAgentMarkdown(step);
        if (!safeStep.trim()) continue;
        renderedSteps.push(result.stepFormat === 'markdown' ? safeStep : `${stepIndex + 1}. ${safeStep}`);
        if (result.stepFormat !== 'markdown') stepIndex += 1;
    }
    return stepIndex;
}
