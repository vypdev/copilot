import type { FixerQueryPort } from '../../../../ports/agent_fixer_ports';
import type { BugbotContextPorts } from '../../../../../application/ports/bugbot_context_ports';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import { ParamUseCase } from '../../../base/param_usecase';
import { Result } from '../../../../../data/model/result';
import {
    BugbotAutofixParam,
    runBugbotAutofixWorkflow,
} from './bugbot_autofix_workflow';

export type { BugbotAutofixParam } from './bugbot_autofix_workflow';

/** Application boundary for safe, agent-driven remediation of Bugbot findings. */
export class BugbotAutofixUseCase implements ParamUseCase<BugbotAutofixParam, Result[]> {
    taskId = 'BugbotAutofixUseCase';

    constructor(
        private readonly aiRepository: FixerQueryPort,
        private readonly contextPorts: BugbotContextPorts,
        private readonly gitCommitPort: GitCommitPort,
    ) {}

    async invoke(param: BugbotAutofixParam): Promise<Result[]> {
        return await runBugbotAutofixWorkflow(param, {
            aiRepository: this.aiRepository,
            contextPorts: this.contextPorts,
            gitCommitPort: this.gitCommitPort,
        });
    }
}
