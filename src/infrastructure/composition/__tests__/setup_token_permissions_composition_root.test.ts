import { SetupCredentialsUseCase } from '../../../application/usecases/setup/setup_credentials_use_case';
import { SetupTokenPermissionsUseCase } from '../../../application/usecases/setup/setup_token_permissions_use_case';
import type { SetupTokenPermissionPresenterPort } from '../../../application/ports/setup_token_permission_ports';
import type { SetupCredentialPromptPort } from '../../../application/ports/setup_wizard_ports';
import {
    createSetupCredentialsUseCase,
    createSetupRemoteConfigurationReadPort,
} from '../setup_credentials_composition_root';
import { createSetupTokenPermissionsUseCase } from '../setup_token_permissions_composition_root';
import { SetupTrustedCredentialHealthAdapter } from '../../setup_trusted_credential_health_adapter';
import { OctokitTrustedCredentialHealthClientAdapter } from '../../github/octokit_credential_health_adapter';
import * as octokit from '../../github/octokit_client_resolver';

describe('setup token permission composition roots', () => {
    it('binds trusted read-only health requests to the supplied setup credential', () => {
        const client = { marker: 'fixture client' };
        const resolve = jest.spyOn(octokit, 'getOctokitClient').mockReturnValue(client);
        try {
            expect(new OctokitTrustedCredentialHealthClientAdapter().getClient('fixture-setup-token')).toBe(client);
            expect(resolve).toHaveBeenCalledTimes(1); expect(resolve).toHaveBeenCalledWith('fixture-setup-token');
        } finally { resolve.mockRestore(); }
    });
    it('composes the permission audit use case from concrete query adapters', () => {
        expect(createSetupTokenPermissionsUseCase()).toBeInstanceOf(SetupTokenPermissionsUseCase);
    });

    it('injects permission auditing and presentation into credential collection', () => {
        const prompt = {} as SetupCredentialPromptPort;
        const presenter = {} as SetupTokenPermissionPresenterPort;

        expect(createSetupCredentialsUseCase(prompt, presenter)).toBeInstanceOf(SetupCredentialsUseCase);
        expect(createSetupRemoteConfigurationReadPort()).toBeDefined();
    });

    it('omits workflow dispatch/bootstrap only in the web pre-Apply composition', () => {
        const prompt = {} as SetupCredentialPromptPort;
        const remoteHealth = (useCase: SetupCredentialsUseCase) =>
            (useCase as unknown as { remoteHealth?: unknown }).remoteHealth;

        expect(remoteHealth(createSetupCredentialsUseCase(prompt))).toBeDefined();
        expect(remoteHealth(createSetupCredentialsUseCase(prompt, undefined, { allowPreApplyHealthWorkflow: false }))).toBeUndefined();
    });
    it('composes organization reuse with read-only trusted evidence and no bootstrap authority', () => {
        const useCase = createSetupCredentialsUseCase({} as SetupCredentialPromptPort, undefined, { configurationSource: 'organization' });
        const capabilities = useCase as unknown as { remoteHealth?: unknown; trustedRemoteHealth?: unknown };
        expect(capabilities.remoteHealth).toBeUndefined();
        expect(capabilities.trustedRemoteHealth).toBeInstanceOf(SetupTrustedCredentialHealthAdapter);
    });
});
