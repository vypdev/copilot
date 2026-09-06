/**
 * Builds the prompt for the configured findings agent when detecting potential problems on push.
 * We pass: repo context, the canonical GitHub PR diff, head/base branch names, issue number,
 * optional ignore patterns, and the block of previously reported findings (task 2).
 * The agent may inspect the read-only workspace for surrounding context and
 * incremental commit ranges that are narrower than the canonical full PR diff.
 */
import type { Execution } from "../../../../../data/model/execution";
import type { BugbotContext } from "./types";
export declare function buildBugbotPrompt(param: Execution, context: BugbotContext): string;
