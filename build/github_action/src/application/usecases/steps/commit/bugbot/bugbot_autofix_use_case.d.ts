import type { Execution } from "../../../../../data/model/execution";
import type { FixerQueryPort } from "../../../../ports/agent_fixer_ports";
import type { BugbotContextPorts } from "../../../../../application/ports/bugbot_context_ports";
import type { GitCommitPort } from "../../../../../application/ports/git_ports";
import { ParamUseCase } from "../../../base/param_usecase";
import { Result } from "../../../../../data/model/result";
import { type BugbotContext } from "./types";
/**
 * Runs the OpenCode build agent to fix the selected bugbot findings. OpenCode edits files
 * directly in the workspace (we do not pass or apply diffs). Caller must run verify commands
 * and commit/push after success (see runBugbotAutofixCommitAndPush).
 */
export interface BugbotAutofixParam {
    execution: Execution;
    targetFindingIds: string[];
    userComment: string;
    /** If provided (e.g. from intent step), reuse to avoid reloading. */
    context?: BugbotContext;
    branchOverride?: string;
}
export declare class BugbotAutofixUseCase implements ParamUseCase<BugbotAutofixParam, Result[]> {
    private readonly aiRepository;
    private readonly contextPorts;
    private readonly gitCommitPort;
    taskId: string;
    constructor(aiRepository: FixerQueryPort, contextPorts: BugbotContextPorts, gitCommitPort: GitCommitPort);
    invoke(param: BugbotAutofixParam): Promise<Result[]>;
}
