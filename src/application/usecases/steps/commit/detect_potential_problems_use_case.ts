import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { BugbotContextPorts } from '../../../ports/bugbot_context_ports';
import type { BugbotFindingPublicationPorts } from '../../../ports/bugbot_finding_publication_ports';
import type { BugbotFindingResolutionPorts } from '../../../ports/bugbot_finding_resolution_ports';
import { ParamUseCase } from '../../../usecases/base/param_usecase';
import { runDetectPotentialProblemsWorkflow } from './detect_potential_problems_workflow';

export type { BugbotFinding } from './bugbot/types';

/** Application boundary for detecting, publishing and resolving Bugbot findings. */
export class DetectPotentialProblemsUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = 'DetectPotentialProblemsUseCase';

    constructor(
        private readonly aiRepository: FindingsQueryPort,
        private readonly contextPorts: BugbotContextPorts,
        private readonly publicationPorts: BugbotFindingPublicationPorts,
        private readonly resolutionPorts: BugbotFindingResolutionPorts,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        return await runDetectPotentialProblemsWorkflow(param, {
            aiRepository: this.aiRepository,
            contextPorts: this.contextPorts,
            publicationPorts: this.publicationPorts,
            resolutionPorts: this.resolutionPorts,
        });
    }
}
