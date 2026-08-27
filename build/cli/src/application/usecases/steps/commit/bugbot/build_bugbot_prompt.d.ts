/**
 * Builds the prompt for OpenCode (plan agent) when detecting potential problems on push.
 * We pass: repo context, head/base branch names (OpenCode computes the diff itself), issue number,
 * optional ignore patterns, and the block of previously reported findings (task 2).
 * We do not pass a pre-computed diff or file list.
 */
import type { Execution } from "../../../../../data/model/execution";
import type { BugbotContext } from "./types";
export declare function buildBugbotPrompt(param: Execution, context: BugbotContext): string;
