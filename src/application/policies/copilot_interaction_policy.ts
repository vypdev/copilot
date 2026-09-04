import { Result } from '../../data/model/result';

export const DEFAULT_COPILOT_BOT_USERNAME = 'vypbot';
export const COPILOT_WELCOME_MARKER = '<!-- copilot:welcome -->';

const SAFE_GITHUB_USERNAME = /^[A-Za-z0-9-]+$/u;

/** Keeps the bot identity safe when it is rendered into a GitHub comment. */
export function normalizeCopilotBotUsername(username: string | undefined): string {
    const candidate = username?.trim().replace(/^@/u, '');
    return candidate && SAFE_GITHUB_USERNAME.test(candidate)
        ? candidate
        : DEFAULT_COPILOT_BOT_USERNAME;
}

/** Renders the stable command reference used by /copilot help. */
export function buildCopilotHelpMessage(username?: string): string {
    const bot = normalizeCopilotBotUsername(username);
    return `## Copilot commands

I’m **@${bot}**, the repository assistant. Use these commands on an issue or pull request:

### Read-only

- \`/copilot help\` — show this command reference.
- \`/copilot plan\` — propose an implementation plan.
- \`/copilot clarify\` — identify missing information and assumptions.
- \`/copilot estimate\` — estimate scope and complexity.
- \`/copilot test-plan\` — propose a focused testing strategy.
- \`/copilot explain <path or symbol>\` — explain code or behavior.
- \`/copilot diagnose\` — investigate a reported problem and suggest likely causes.
- \`/copilot analyze\` — review the current issue, branch, or pull request for potential problems.
- \`/copilot review\` — run the Bugbot review.
- \`/copilot findings\` — show potential findings from the current code.
- \`/copilot recheck\` — re-run the review and reconcile findings.
- \`/copilot description\` — refresh the pull-request description.
- \`/copilot status\` — show the current automation status.

### Changes

- \`/copilot fix <finding-id>\` — fix one reported finding.
- \`/copilot fix all\` — fix all unresolved findings.
- \`/copilot dismiss <finding-id>\` — dismiss a finding.
- \`/copilot implement <request>\` — apply an explicitly requested repository change.

You can also ask a question in natural language by mentioning **@${bot}**. File-changing commands are restricted to authorized maintainers, run the configured checks, and report the resulting changes.`;
}

/** Renders the one-time onboarding comment for a newly created issue. */
export function buildCopilotWelcomeMessage(username?: string): string {
    const bot = normalizeCopilotBotUsername(username);
    return `${COPILOT_WELCOME_MARKER}

Hi! I’m **@${bot}**, the Copilot assistant for this repository.

I can answer questions, explain the codebase, propose implementation and test plans, review issues and pull requests for potential bugs or security problems, and help authorized maintainers apply changes.

Try \`/copilot help\` to see the available commands, or mention **@${bot}** with your question.`;
}

/** Creates a publishable result for issues that have no agent-generated reply. */
export function buildCopilotWelcomeResult(username?: string): Result {
    return new Result({
        id: 'CopilotWelcomeUseCase',
        success: true,
        executed: true,
        stepFormat: 'markdown',
        steps: [buildCopilotWelcomeMessage(username)],
    });
}
