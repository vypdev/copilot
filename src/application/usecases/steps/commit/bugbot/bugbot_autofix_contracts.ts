import type { Execution } from '../../../../../data/model/execution';
import type { FixerQueryPort } from '../../../../ports/agent_fixer_ports';
import type { BugbotContextPorts } from '../../../../../application/ports/bugbot_context_ports';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import type { BugbotContext } from './types';

export interface BugbotAutofixParam {
    execution: Execution;
    targetFindingIds: string[];
    userComment: string;
    context?: BugbotContext;
    branchOverride?: string;
}

export interface BugbotAutofixWorkflowDependencies {
    aiRepository: FixerQueryPort;
    contextPorts: BugbotContextPorts;
    gitCommitPort: GitCommitPort;
}
