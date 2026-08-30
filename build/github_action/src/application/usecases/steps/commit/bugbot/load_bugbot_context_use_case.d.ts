/**
 * Loads all bugbot context from GitHub repositories and delegates comment parsing to a pure collaborator.
 */
import type { Execution } from "../../../../../data/model/execution";
import type { BugbotContextPorts } from "../../../../../application/ports/bugbot_context_ports";
import type { BugbotContext } from "./types";
export interface LoadBugbotContextOptions {
    /** When set (e.g. for issue_comment when commit.branch is empty), use this branch to find open PRs. */
    branchOverride?: string;
    /** Allows PR review to operate without an issue parsed from the branch name. */
    issueNumberOverride?: number;
    /** Uses the event PR directly instead of searching by branch. */
    pullRequestNumberOverride?: number;
}
export declare function loadBugbotContext(param: Execution, options: LoadBugbotContextOptions | undefined, ports: BugbotContextPorts): Promise<BugbotContext>;
