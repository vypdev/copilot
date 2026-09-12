import type { FixerQueryPort } from '../../../../ports/agent_fixer_ports';
import type { BugbotContextPorts } from '../../../../../application/ports/bugbot_context_ports';
import type { BugbotGitMutationPort } from '../../../../../application/ports/bugbot_git_ports';
import type { BugbotContext } from './types';
import type { BugbotAutofixOperationContext } from './bugbot_review_operation_context';

export interface BugbotAutofixParam {
    operation: BugbotAutofixOperationContext;
    targetFindingIds: string[];
    userComment: string;
    context?: BugbotContext;
    branchOverride?: string;
}

export interface BugbotAutofixWorkflowDependencies {
    aiRepository: FixerQueryPort;
    contextPorts: BugbotContextPorts;
    gitCommitPort: BugbotGitMutationPort;
}
