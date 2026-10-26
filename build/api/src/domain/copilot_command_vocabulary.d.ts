/** Explicit commands are the safe, deterministic entry point for mutations. */
export declare const COPILOT_COMMAND_NAMES: readonly ["help", "analyze", "plan", "clarify", "estimate", "test-plan", "status", "sdd-diff", "doctor", "history", "description", "explain", "diagnose", "review", "findings", "fix", "dismiss", "remember", "recheck", "implement", "sync-branch"];
export type CopilotCommandName = typeof COPILOT_COMMAND_NAMES[number];
