import type { BoundPublicationSourceQueryPort } from '../../application/ports/publication_freshness_ports';
import type { BugbotVerificationAuthority } from '../../domain/bugbot/verification_receipt';
import type { AgentConfiguration } from '../../domain/agent';
import type { FindingsQueryPort } from '../../application/ports/agent_findings_ports';
import type { BugbotScmPorts } from '../../application/ports/bugbot_scm_ports';
import type { BugbotShadowVerificationPort } from '../../application/ports/bugbot_shadow_verification_ports';
import type { BugbotTelemetryPort } from '../../application/ports/bugbot_telemetry_ports';
import type { MessageCatalogResolutionPort } from '../../application/ports/message_catalog_ports';
import { DetectPotentialProblemsUseCase } from '../../application/usecases/steps/commit/detect_potential_problems_use_case';

export function composeBugbotReview({ findings, scm, telemetry, catalog, shadowVerification, experimentalShadowProfile, verificationAuthority, sourceFreshness }: {
    findings: FindingsQueryPort;
    scm: BugbotScmPorts;
    telemetry?: BugbotTelemetryPort;
    catalog?: MessageCatalogResolutionPort;
    shadowVerification?: BugbotShadowVerificationPort;
    experimentalShadowProfile?: Readonly<AgentConfiguration>;
    verificationAuthority?: BugbotVerificationAuthority;
    sourceFreshness?: BoundPublicationSourceQueryPort;
}): DetectPotentialProblemsUseCase {
    return new DetectPotentialProblemsUseCase(findings, scm, telemetry, catalog, shadowVerification, experimentalShadowProfile, verificationAuthority, sourceFreshness);
}
