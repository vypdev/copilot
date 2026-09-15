import { Result } from '../../data/model/result';
import {
    resolveStaticPublicationCatalog,
    type PublicationMessageCatalog,
    type PublicationMessageId,
} from './publication_message_catalog';

export const DEFAULT_COPILOT_BOT_USERNAME = 'vypbot';

const SAFE_GITHUB_USERNAME = /^[A-Za-z0-9-]+$/u;

const READ_ONLY_COMMANDS: readonly [string, PublicationMessageId][] = Object.freeze([
    ['/copilot help', 'interaction.help.command.help'],
    ['/copilot plan', 'interaction.help.command.plan'],
    ['/copilot clarify', 'interaction.help.command.clarify'],
    ['/copilot estimate', 'interaction.help.command.estimate'],
    ['/copilot test-plan', 'interaction.help.command.testPlan'],
    ['/copilot explain <path or symbol>', 'interaction.help.command.explain'],
    ['/copilot diagnose', 'interaction.help.command.diagnose'],
    ['/copilot analyze', 'interaction.help.command.analyze'],
    ['/copilot review [effort=smart|low|default|high] [dry-run=true] [trace-rules=true] [suggested-changes=false]', 'interaction.help.command.review'],
    ['/copilot findings', 'interaction.help.command.findings'],
    ['/copilot recheck', 'interaction.help.command.recheck'],
    ['/copilot description', 'interaction.help.command.description'],
    ['/copilot status', 'interaction.help.command.status'],
]);

const CHANGE_COMMANDS: readonly [string, PublicationMessageId][] = Object.freeze([
    ['/copilot fix <finding-id>', 'interaction.help.command.fixOne'],
    ['/copilot fix all', 'interaction.help.command.fixAll'],
    ['/copilot dismiss <finding-id>', 'interaction.help.command.dismiss'],
    ['/copilot remember <rule>', 'interaction.help.command.remember'],
    ['/copilot implement <request>', 'interaction.help.command.implement'],
    ['/copilot sync-branch [--dry-run] [--no-agent] [--from <branch>]', 'interaction.help.command.syncBranch'],
]);

/** Keeps the bot identity safe when it is rendered into a GitHub comment. */
export function normalizeCopilotBotUsername(username: string | undefined): string {
    const candidate = username?.trim().replace(/^@/u, '');
    return candidate && SAFE_GITHUB_USERNAME.test(candidate)
        ? candidate
        : DEFAULT_COPILOT_BOT_USERNAME;
}

/** Renders localized prose around stable English command syntax. */
export function buildCopilotHelpMessage(
    username?: string,
    locale = 'en-US',
    catalog: PublicationMessageCatalog = resolveStaticPublicationCatalog(locale).catalog,
): string {
    const bot = normalizeCopilotBotUsername(username);
    const botDisplay = `**@${bot}**`;
    return [
        `## ${catalog.render('interaction.help.heading')}`,
        '',
        catalog.render('interaction.help.introduction', { bot: botDisplay }),
        '',
        `### ${catalog.render('interaction.help.readOnlyHeading')}`,
        '',
        ...commandLines(READ_ONLY_COMMANDS, catalog),
        '',
        `### ${catalog.render('interaction.help.changesHeading')}`,
        '',
        ...commandLines(CHANGE_COMMANDS, catalog),
        '',
        catalog.render('interaction.help.footer', { bot: botDisplay }),
    ].join('\n');
}

/** Renders the one-time onboarding comment for a newly created issue. */
export function buildCopilotWelcomeMessage(
    username?: string,
    locale = 'en-US',
    catalog: PublicationMessageCatalog = resolveStaticPublicationCatalog(locale).catalog,
): string {
    const bot = normalizeCopilotBotUsername(username);
    const botDisplay = `**@${bot}**`;
    return [
        catalog.render('interaction.welcome.greeting', { bot: botDisplay }),
        '',
        catalog.render('interaction.welcome.capabilities'),
        '',
        catalog.render('interaction.welcome.hint', { bot: botDisplay, helpCommand: '`/copilot help`' }),
    ].join('\n');
}

/** Creates a publishable result for issues that have no agent-generated reply. */
export function buildCopilotWelcomeResult(username?: string, locale = 'en-US'): Result {
    return new Result({
        id: 'CopilotWelcomeUseCase',
        success: true,
        executed: true,
        stepFormat: 'markdown',
        steps: [buildCopilotWelcomeMessage(username, locale)],
        payload: Object.freeze({ publication: Object.freeze({ kind: 'welcome', botLogin: normalizeCopilotBotUsername(username) }) }),
    });
}

function commandLines(
    commands: readonly [string, PublicationMessageId][],
    catalog: PublicationMessageCatalog,
): string[] {
    return commands.map(([syntax, description]) => `- \`${syntax}\` — ${catalog.render(description)}`);
}
