import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { BugbotScmPorts } from '../../../ports/bugbot_scm_ports';
import { ParamUseCase } from '../../../usecases/base/param_usecase';
import { runDetectPotentialProblemsWorkflow } from './detect_potential_problems_workflow';
import type { BugbotReviewOperationContext } from './bugbot/bugbot_review_operation_context';
import type { BugbotTelemetryPort } from '../../../ports/bugbot_telemetry_ports';

export type { BugbotFinding } from '../../../../domain/bugbot/finding';

/** Application boundary for detecting, publishing and resolving Bugbot findings. */
export class DetectPotentialProblemsUseCase implements ParamUseCase<BugbotReviewOperationContext, Result[]> {
    taskId = 'DetectPotentialProblemsUseCase';

    constructor(
        private readonly aiRepository: FindingsQueryPort,
        private readonly scm: BugbotScmPorts,
        private readonly telemetryPort?: BugbotTelemetryPort,
    ) {}

    async invoke(param: BugbotReviewOperationContext): Promise<Result[]> {
        return await runDetectPotentialProblemsWorkflow(param, {
            aiRepository: this.aiRepository,
            scm: this.scm,
            telemetryPort: this.telemetryPort,
        });
    }
}
