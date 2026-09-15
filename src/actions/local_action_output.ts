import chalk from 'chalk';
import boxen from 'boxen';
import { TITLE } from '../application/contracts/product_identity';
import { renderApplicationErrorText } from '../application/policies/application_error_presentation_policy';
import type { ApplicationError } from '../data/model/application_error';
import { getResultPayload } from '../data/model/result';
import { createUntrustedContent } from '../domain/security/untrusted_content';
import {
    ENGLISH_PUBLICATION_CATALOG,
    type PublicationMessageCatalog,
} from '../application/policies/publication_message_catalog';
import { logInfo } from '../utils/logger';

type LocalActionResult = {
    executed: boolean;
    steps: string[];
    errors: readonly ApplicationError[];
    reminders: string[];
    payload?: unknown;
};

export function renderLocalActionResults(
    results: LocalActionResult[],
    catalog: PublicationMessageCatalog = ENGLISH_PUBLICATION_CATALOG,
): void {
    let content = '';
    const answersContent = results
        .filter(result => result.executed)
        .map(result => directAnswer(result.payload))
        .filter((answer): answer is string => Boolean(answer))
        .map(answer => chalk.gray(answer)).join('\n\n');

    if (answersContent.length > 0) {
        content += '\n' + chalk.cyan(`${catalog.cli.answer}:`) + '\n' + answersContent;
    }

    const stepsContent = results
        .filter(result => result.executed && result.steps.length > 0)
        .map(result => chalk.gray(result.steps.join('\n'))).join('\n');

    if (stepsContent.length > 0) {
        content += '\n' + chalk.cyan(`${catalog.cli.steps}:`) + '\n' + stepsContent;
    }

    const errorsContent = results
        .filter(result => result.errors.length > 0)
        .map(result => chalk.gray(result.errors.map(renderApplicationErrorText).join('\n\n'))).join('\n');

    if (errorsContent.length > 0) {
        content += '\n' + chalk.red(`${catalog.cli.errors}:`) + '\n' + errorsContent;
    }

    const reminderContent = results
        .filter(result => result.executed && result.reminders.length > 0)
        .map(result => chalk.gray(result.reminders.join('\n'))).join('\n');

    if (reminderContent.length > 0) {
        content += '\n' + chalk.cyan(`${catalog.cli.reminder}:`) + '\n' + reminderContent;
    }

    logInfo('\n');
    logInfo(
        boxen(
            content,
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan',
                title: TITLE,
                titleAlignment: 'center',
            },
        ),
    );
}

function directAnswer(payload: unknown): string | undefined {
    const publication = getResultPayload(getResultPayload(payload)?.publication);
    if (publication?.kind !== 'direct-answer' || typeof publication.answer !== 'string') return undefined;
    const answer = createUntrustedContent(publication.answer, 'local.result.direct-answer').text.trim();
    return answer || undefined;
}
