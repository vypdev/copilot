/** Explicit commands are the safe, deterministic entry point for mutations. */
export const COPILOT_COMMAND_NAMES = [
    'help',
    'analyze',
    'plan',
    'clarify',
    'estimate',
    'test-plan',
    'status',
    'sdd-diff',
    'doctor',
    'history',
    'description',
    'explain',
    'diagnose',
    'review',
    'findings',
    'fix',
    'dismiss',
    'remember',
    'recheck',
    'implement',
    'sync-branch',
] as const;

export type CopilotCommandName = typeof COPILOT_COMMAND_NAMES[number];
