import type { CopilotCommandName } from './copilot_command_vocabulary';
/** Closed public reasons; none contains user text, operands, paths or credentials. */
export declare const COPILOT_COMMAND_VALIDATION_REASONS: readonly ["comment-command-length", "comment-command-name-missing", "comment-command-name-unknown", "comment-command-argument-count", "comment-command-arguments-unexpected", "comment-command-arguments-missing", "comment-command-finding-quoting", "comment-command-review-format", "comment-command-review-effort", "comment-command-review-boolean", "comment-command-review-option", "comment-command-sync-option", "comment-command-sync-parent"];
export type CopilotCommandValidationReason = typeof COPILOT_COMMAND_VALIDATION_REASONS[number];
export interface CopilotCommandValidationDiagnostic {
    readonly reason: CopilotCommandValidationReason;
    readonly command: CopilotCommandName;
}
export declare function isCopilotCommandValidationReason(value: unknown): value is CopilotCommandValidationReason;
export declare function isValidCopilotCommandValidation(reason: unknown, command: unknown): boolean;
