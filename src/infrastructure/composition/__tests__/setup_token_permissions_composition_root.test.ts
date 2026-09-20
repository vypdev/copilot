import { SetupCredentialsUseCase } from '../../../application/usecases/setup/setup_credentials_use_case';
import { SetupTokenPermissionsUseCase } from '../../../application/usecases/setup/setup_token_permissions_use_case';
import type { SetupTokenPermissionPresenterPort } from '../../../application/ports/setup_token_permission_ports';
import type { SetupCredentialPromptPort } from '../../../application/ports/setup_wizard_ports';
import {
    createSetupCredentialsUseCase,
    createSetupRemoteConfigurationReadPort,
} from '../setup_credentials_composition_root';
import { createSetupTokenPermissionsUseCase } from '../setup_token_permissions_composition_root';

describe('setup token permission composition roots', () => {
    it('composes the permission audit use case from concrete query adapters', () => {
        expect(createSetupTokenPermissionsUseCase()).toBeInstanceOf(SetupTokenPermissionsUseCase);
    });

    it('injects permission auditing and presentation into credential collection', () => {
        const prompt = {} as SetupCredentialPromptPort;
        const presenter = {} as SetupTokenPermissionPresenterPort;

        expect(createSetupCredentialsUseCase(prompt, presenter)).toBeInstanceOf(SetupCredentialsUseCase);
        expect(createSetupRemoteConfigurationReadPort()).toBeDefined();
    });
});
