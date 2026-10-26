import type { CopilotCommandName } from './copilot_command_vocabulary';

/** Closed public reasons; none contains user text, operands, paths or credentials. */
export const COPILOT_COMMAND_VALIDATION_REASONS = Object.freeze([
  'comment-command-length', 'comment-command-name-missing', 'comment-command-name-unknown',
  'comment-command-argument-count', 'comment-command-arguments-unexpected', 'comment-command-arguments-missing',
  'comment-command-finding-quoting', 'comment-command-review-format', 'comment-command-review-effort',
  'comment-command-review-boolean', 'comment-command-review-option',
  'comment-command-sync-option', 'comment-command-sync-parent',
] as const);

export type CopilotCommandValidationReason = typeof COPILOT_COMMAND_VALIDATION_REASONS[number];

export interface CopilotCommandValidationDiagnostic {
  readonly reason: CopilotCommandValidationReason;
  readonly command: CopilotCommandName;
}

const REVIEW_COMMANDS = Object.freeze(['analyze', 'review', 'findings', 'recheck'] as const);
const COMMANDS_BY_REASON: Readonly<Record<CopilotCommandValidationReason, readonly CopilotCommandName[]>> = Object.freeze({
  'comment-command-length': Object.freeze(['help'] as const),
  'comment-command-name-missing': Object.freeze(['help'] as const),
  'comment-command-name-unknown': Object.freeze(['help'] as const),
  'comment-command-argument-count': Object.freeze(['help', 'analyze', 'sdd-diff', 'doctor', 'history', 'description',
    'review', 'findings', 'fix', 'dismiss', 'recheck', 'sync-branch'] as const),
  'comment-command-arguments-unexpected': Object.freeze(['status', 'sdd-diff', 'doctor', 'history'] as const),
  'comment-command-arguments-missing': Object.freeze(['fix', 'dismiss', 'implement', 'remember'] as const),
  'comment-command-finding-quoting': Object.freeze(['fix', 'dismiss'] as const),
  'comment-command-review-format': REVIEW_COMMANDS,
  'comment-command-review-effort': REVIEW_COMMANDS,
  'comment-command-review-boolean': REVIEW_COMMANDS,
  'comment-command-review-option': REVIEW_COMMANDS,
  'comment-command-sync-option': Object.freeze(['sync-branch'] as const),
  'comment-command-sync-parent': Object.freeze(['sync-branch'] as const),
});

export function isCopilotCommandValidationReason(value: unknown): value is CopilotCommandValidationReason {
  return COPILOT_COMMAND_VALIDATION_REASONS.some(reason => reason === value);
}

export function isValidCopilotCommandValidation(reason: unknown, command: unknown): boolean {
  return isCopilotCommandValidationReason(reason)
    && COMMANDS_BY_REASON[reason].some(value => value === command);
}
