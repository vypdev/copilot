import { Result } from '../../data/model/result';
export declare const DEFAULT_COPILOT_BOT_USERNAME = "vypbot";
export declare const COPILOT_WELCOME_MARKER = "<!-- copilot:welcome -->";
/** Keeps the bot identity safe when it is rendered into a GitHub comment. */
export declare function normalizeCopilotBotUsername(username: string | undefined): string;
/** Renders the stable command reference used by /copilot help. */
export declare function buildCopilotHelpMessage(username?: string): string;
/** Renders the one-time onboarding comment for a newly created issue. */
export declare function buildCopilotWelcomeMessage(username?: string): string;
/** Creates a publishable result for issues that have no agent-generated reply. */
export declare function buildCopilotWelcomeResult(username?: string): Result;
