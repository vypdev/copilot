import type { Result } from '../../data/model/result';
import type { ResultPublicationSections } from './result_publication_contracts';

export function renderResultSections(results: ReadonlyArray<Result>): ResultPublicationSections {
    const renderedSteps: string[] = [];
    const reminders: string[] = [];
    const errors: string[] = [];
    let stepIndex = 0;

    for (const result of results) {
        stepIndex = appendSteps(renderedSteps, result, stepIndex);
        reminders.push(...result.reminders);
        errors.push(...result.errors.map(error => error.message));
    }

    return {
        content: renderedSteps.length > 0 ? `${renderedSteps.join('\n\n')}\n` : '',
        footer: reminders.length > 0 ? `\n## Reminder\n\n${reminders.map((reminder, index) => `${index + 1}. ${reminder}`).join('\n')}\n` : '',
        errors: errors.length > 0
            ? `\n## Errors Found\n\n${errors.map((error, index) => `${index + 1}.\n\`\`\`\n${error}\n\`\`\`\n`).join('')}\n\nCheck your project configuration, if everything is okay consider [opening an issue](https://github.com/vypdev/copilot/issues/new/choose).\n`
            : '',
    };
}

function appendSteps(renderedSteps: string[], result: Result, stepIndex: number): number {
    for (const step of result.steps) {
        if (!step.trim()) continue;
        renderedSteps.push(result.stepFormat === 'markdown' ? step : `${stepIndex + 1}. ${step}`);
        if (result.stepFormat !== 'markdown') stepIndex += 1;
    }
    return stepIndex;
}
