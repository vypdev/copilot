import type { FixerQueryPort } from '../../../../ports/agent_fixer_ports';
import type { BugbotContextPorts } from '../../../../../application/ports/bugbot_context_ports';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import { ParamUseCase } from '../../../base/param_usecase';
import { Result } from '../../../../../data/model/result';
import type { BugbotAutofixParam } from './bugbot_autofix_workflow';
export type { BugbotAutofixParam } from './bugbot_autofix_workflow';
/** Application boundary for safe, agent-driven remediation of Bugbot findings. */
export declare class BugbotAutofixUseCase implements ParamUseCase<BugbotAutofixParam, Result[]> {
    private readonly aiRepository;
    private readonly contextPorts;
    private readonly gitCommitPort;
    taskId: string;
    constructor(aiRepository: FixerQueryPort, contextPorts: BugbotContextPorts, gitCommitPort: GitCommitPort);
    invoke(param: BugbotAutofixParam): Promise<Result[]>;
}
