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
    success: boolean;
    executed: boolean;
    errors: readonly ApplicationError[];
    reminders: string[];
    payload?: unknown;
};

export function renderLocalActionResults(
    results: LocalActionResult[],
    catalog: PublicationMessageCatalog = ENGLISH_PUBLICATION_CATALOG,
): void {
    let content = '';
    const failed = results.filter(result => result.errors.length > 0 || !result.success).length;
    const completed = results.filter(result => result.executed
        && result.errors.length === 0
        && result.success).length;
    const skipped = results.filter(result => !result.executed
        && result.errors.length === 0
        && result.success).length;
    const operatorReminders = results.reduce((total, result) => total + result.reminders.length, 0);
    const answersContent = results
        .filter(result => result.executed && result.errors.length === 0 && result.success)
        .map(result => directAnswer(result.payload))
        .filter((answer): answer is string => Boolean(answer))
        .map(answer => chalk.gray(answer)).join('\n\n');

    if (answersContent.length > 0) {
        content += '\n' + chalk.cyan(`${catalog.cli.answer}:`) + '\n' + answersContent;
    }

    if (answersContent.length === 0 || failed > 0 || skipped > 0 || operatorReminders > 0) {
        const status = failed > 0
            ? completed > 0 ? 'partial' : 'failed'
            : completed > 0 ? 'succeeded' : 'no-changes';
        const number = new Intl.NumberFormat(catalog.locale);
        const rows = [
            `${catalog.cli.status}: ${catalog.cli.statusValue[status]}`,
            ...(completed > 0 ? [`${catalog.cli.completed}: ${number.format(completed)}`] : []),
            ...(skipped > 0 ? [`${catalog.cli.skipped}: ${number.format(skipped)}`] : []),
            ...(failed > 0 ? [`${catalog.cli.failed}: ${number.format(failed)}`] : []),
            ...(operatorReminders > 0
                ? [`${catalog.cli.operatorReminders}: ${number.format(operatorReminders)}`]
                : []),
        ];
        content += '\n' + chalk.cyan(`${catalog.cli.outcome}:`) + '\n' + chalk.gray(rows.join('\n'));
    }

    const errorsContent = results
        .filter(result => result.errors.length > 0)
        .map(result => chalk.gray(result.errors
            .map(error => renderApplicationErrorText(error, catalog.render))
            .join('\n\n'))).join('\n');

    if (errorsContent.length > 0) {
        content += '\n' + chalk.red(`${catalog.cli.errors}:`) + '\n' + errorsContent;
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
