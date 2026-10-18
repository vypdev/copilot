import type { SetupConfiguration, SetupOwnerType } from '../../domain/setup';
import type { SetupInstallationReview, SetupRunnerInventory } from '../../domain/setup_runner';

export interface SetupRunnerDiscoveryPort {
  discover(owner: string, repository: string, token: string, ownerType: SetupOwnerType): Promise<SetupRunnerInventory>;
}
export interface SetupInstallationReviewPort {
  inspect(configuration: SetupConfiguration): Promise<SetupInstallationReview>;
}
