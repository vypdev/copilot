/** Explicit commands are the safe, deterministic entry point for mutations. */
export declare const COPILOT_COMMAND_NAMES: readonly ["plan", "clarify", "estimate", "test-plan", "status", "review", "findings", "fix", "dismiss", "recheck"];
export type CopilotCommandName = typeof COPILOT_COMMAND_NAMES[number];
export interface ParsedCopilotCommand {
    readonly name: CopilotCommandName;
    readonly arguments: readonly string[];
    readonly raw: string;
}
export type CopilotCommandParseResult = {
    readonly kind: 'none';
} | {
    readonly kind: 'command';
    readonly command: ParsedCopilotCommand;
} | {
    readonly kind: 'invalid';
    readonly reason: string;
};
/**
 * Parses only a command at the beginning of a comment. Everything else is
 * ordinary user data and must continue through the existing agent flow.
 */
export declare function parseCopilotCommand(raw: unknown): CopilotCommandParseResult;
