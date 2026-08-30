import { CopilotEvidenceRepository } from '../../data/repository/copilot_evidence_repository';
import { OctokitChecksClientAdapter } from '../github/octokit_checks_adapters';

export function createCopilotEvidenceCompositionRoot(): CopilotEvidenceRepository {
    return new CopilotEvidenceRepository(new OctokitChecksClientAdapter());
}
