import type { SetupConfiguration, SetupRemoteConfiguration } from '../../../domain/setup';
import type { SetupRemoteConfigurationReadPort, SetupWorkflowPatConflictPromptPort } from '../../ports/setup_wizard_ports';
import { resolveSetupResourceScope } from '../../policies/setup_configuration_storage_policy';
import { cloneSetupConfiguration } from '../../policies/setup_configuration_clone_policy';
import { SetupInteractionCancelledError } from '../../errors/setup_interaction_cancelled_error';

interface Request {
    readonly owner: string;
    readonly repository: string;
    readonly token: string;
    readonly configuration: SetupConfiguration;
    readonly remote: SetupRemoteConfiguration;
}

/** Explicit, read-only conflict recovery. A claimed deletion is never evidence. */
export class ResolveSetupWorkflowPatConflictUseCase {
    constructor(
        private readonly prompt: SetupWorkflowPatConflictPromptPort,
        private readonly remote: SetupRemoteConfigurationReadPort,
    ) {}

    async execute(request: Request): Promise<{ configuration: SetupConfiguration; remote: SetupRemoteConfiguration }> {
        const configuration = cloneSetupConfiguration(request.configuration);
        let remote = request.remote;
        let state: 'present' | 'unavailable' = 'present';
        if (!configuration.manageRepositorySecrets
            || resolveSetupResourceScope(configuration.storage.secrets, 'PAT') !== 'organization'
            || remote.repositorySecretsAccess !== 'available'
            || !remote.repositorySecrets.includes('PAT')) return { configuration, remote };

        while (true) {
            const decision = await this.prompt.resolveWorkflowPatConflict(`${request.owner}/${request.repository}`, state);
            if (decision === 'cancel') throw new SetupInteractionCancelledError();
            if (decision === 'repository') {
                configuration.storage.secrets.overrides.PAT = 'repository';
                return { configuration, remote };
            }
            try {
                const refreshed = await this.remote.inspect(request.owner, request.repository, request.token);
                if (refreshed.repositorySecretsAccess !== 'available') {
                    state = 'unavailable';
                    continue;
                }
                remote = refreshed;
                if (!remote.repositorySecrets.includes('PAT')) return { configuration, remote };
                state = 'present';
            } catch {
                // Failed reads retain the draft and the last known conflict, never an empty inventory.
                state = 'unavailable';
            }
        }
    }
}
