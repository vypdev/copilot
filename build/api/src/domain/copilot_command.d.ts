import type { CopilotCommandValidationDiagnostic } from './copilot_command_validation';
import { type CopilotCommandName } from './copilot_command_vocabulary';
export { COPILOT_COMMAND_NAMES, type CopilotCommandName } from './copilot_command_vocabulary';
/** Commands whose arguments may contain human prose that benefits from locale adaptation. */
export declare function copilotCommandAcceptsAdaptableProse(name: CopilotCommandName): boolean;
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
    readonly validation: CopilotCommandValidationDiagnostic;
};
/**
 * Parses only a command at the beginning of a comment. Everything else is
 * ordinary user data and must continue through the existing agent flow.
 */
export declare function parseCopilotCommand(raw: unknown): CopilotCommandParseResult;
