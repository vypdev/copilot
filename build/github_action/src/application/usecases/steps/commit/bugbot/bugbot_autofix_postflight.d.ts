import type { Execution } from '../../../../../data/model/execution';
import { Result } from '../../../../../data/model/result';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import type { BugbotContext } from './types';
export declare function finalizeBugbotAutofix(execution: Execution, context: BugbotContext, idsToFix: string[], workspacePathsBefore: string[], responseText: string | undefined, gitCommitPort: GitCommitPort): Promise<Result[]>;
