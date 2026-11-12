import type { BoundPublicationSourceQueryPort } from '../../../ports/publication_freshness_ports';
import type { BugbotVerificationAuthority } from '../../../../domain/bugbot/verification_receipt';
import type { AgentConfiguration } from '../../../../domain/agent';
import type { BugbotShadowVerificationPort } from '../../../ports/bugbot_shadow_verification_ports';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { BugbotScmPorts } from '../../../ports/bugbot_scm_ports';
import { ParamUseCase } from '../../../usecases/base/param_usecase';
import { runDetectPotentialProblemsWorkflow } from './detect_potential_problems_workflow';
import type { BugbotReviewOperationContext } from './bugbot/bugbot_review_operation_context';
import type { BugbotTelemetryPort } from '../../../ports/bugbot_telemetry_ports';
import type { MessageCatalogResolutionPort } from '../../../ports/message_catalog_ports';

export type { BugbotFinding } from '../../../../domain/bugbot/finding';

/** Application boundary for detecting, publishing and resolving Bugbot findings. */
export class DetectPotentialProblemsUseCase implements ParamUseCase<BugbotReviewOperationContext, Result[]> {
    taskId = 'DetectPotentialProblemsUseCase';

    constructor(
        private readonly aiRepository: FindingsQueryPort,
        private readonly scm: BugbotScmPorts,
        private readonly telemetryPort?: BugbotTelemetryPort,
        private readonly catalogResolver?: MessageCatalogResolutionPort,
        private readonly shadowVerification?: BugbotShadowVerificationPort,
        private readonly experimentalShadowProfile?: Readonly<AgentConfiguration>,
        private readonly verificationAuthority?: BugbotVerificationAuthority,
        private readonly sourceFreshness?: BoundPublicationSourceQueryPort,
    ) {}

    async invoke(param: BugbotReviewOperationContext): Promise<Result[]> {
        return await runDetectPotentialProblemsWorkflow(param, {
            aiRepository: this.aiRepository,
            scm: this.scm,
            telemetryPort: this.telemetryPort,
            catalogResolver: this.catalogResolver,
            shadowVerification: this.shadowVerification,
            experimentalShadowProfile: this.experimentalShadowProfile,
            verificationAuthority: this.verificationAuthority,
            sourceFreshness: this.sourceFreshness,
        });
    }
}
