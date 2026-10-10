import type { SetupApprovalCheckCandidate, SetupDiscoveryResult } from '../../domain/setup_questionnaire';

export interface SetupApprovalCheckDiscoveryPort {
  discover(owner: string, repository: string, token: string, targetBranch?: string): Promise<SetupDiscoveryResult<SetupApprovalCheckCandidate>>;
}
