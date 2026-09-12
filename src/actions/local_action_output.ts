import chalk from 'chalk';
import boxen from 'boxen';
import { TITLE } from '../application/contracts/product_identity';
import { renderApplicationErrorText } from '../application/policies/application_error_presentation_policy';
import type { ApplicationError } from '../data/model/application_error';
import { logInfo } from '../utils/logger';

type LocalActionResult = {
    executed: boolean;
    steps: string[];
    errors: readonly ApplicationError[];
    reminders: string[];
};

export function renderLocalActionResults(results: LocalActionResult[]): void {
        let content = ''
        const stepsContent = results
            .filter(result => result.executed && result.steps.length > 0)
            .map(result => chalk.gray(result.steps.join('\n'))).join('\n')

        if (stepsContent.length > 0) {
            content +=  '\n' + chalk.cyan('Steps:') + '\n' + stepsContent
        }

        const errorsContent = results
            .filter(result => result.errors.length > 0)
            .map(result => chalk.gray(result.errors.map(renderApplicationErrorText).join('\n\n'))).join('\n')

        if (errorsContent.length > 0) {
            content +=  '\n' + chalk.red('Errors:') + '\n' + errorsContent
        }

        const reminderContent = results
            .filter(result => result.executed && result.reminders.length > 0)
            .map(result => chalk.gray(result.reminders.join('\n'))).join('\n')

        if (reminderContent.length > 0) {
            content +=  '\n' + chalk.cyan('Reminder:') + '\n' + reminderContent
        }

        logInfo('\n')
        logInfo(
            boxen(
                content,
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'cyan',
                    title: TITLE,
                    titleAlignment: 'center'
                }
            )
        );
}
