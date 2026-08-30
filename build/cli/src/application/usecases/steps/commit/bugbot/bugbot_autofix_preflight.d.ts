import type { Execution } from '../../../../../data/model/execution';
import { Result } from '../../../../../data/model/result';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import type { BugbotContextPorts } from '../../../../../application/ports/bugbot_context_ports';
import type { BugbotContext } from './types';
export type BugbotAutofixPreflight = {
    context: BugbotContext;
    workspacePathsBefore: string[];
    idsToFix: string[];
    prompt: string;
};
export declare function prepareBugbotAutofix(execution: Execution, targetFindingIds: string[], userComment: string, providedContext: BugbotContext | undefined, branchOverride: string | undefined, contextPorts: BugbotContextPorts, gitCommitPort: GitCommitPort): Promise<BugbotAutofixPreflight | Result[]>;
