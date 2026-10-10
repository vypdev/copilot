import type { SetupDiscoveryResult, SetupProjectCandidate } from '../../domain/setup_questionnaire';

/** Read-only GitHub Project inventory for setup; the PAT never crosses into a browser view. */
export interface SetupProjectDiscoveryPort {
  discover(owner: string, ownerType: 'Organization' | 'User' | 'Unknown', token: string): Promise<SetupDiscoveryResult<SetupProjectCandidate>>;
}
