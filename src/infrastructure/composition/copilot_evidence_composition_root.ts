import { CopilotEvidenceRepository } from '../../data/repository/copilot_evidence_repository';
import { OctokitChecksClientAdapter } from '../github/octokit_checks_adapters';
import { createGithubBugbotVerificationArtifacts } from '../github/github_bugbot_verification_artifact';

export function createCopilotEvidenceCompositionRoot(): CopilotEvidenceRepository {
    return new CopilotEvidenceRepository(new OctokitChecksClientAdapter(), createGithubBugbotVerificationArtifacts());
}
