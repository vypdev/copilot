import { SetupCredentialsUseCase } from '../../application/usecases/setup/setup_credentials_use_case';
import type { SetupCredentialPromptPort, SetupRemoteConfigurationReadPort } from '../../application/ports/setup_wizard_ports';
export declare function createSetupCredentialsUseCase(prompt: SetupCredentialPromptPort): SetupCredentialsUseCase;
export declare function createSetupRemoteConfigurationReadPort(): SetupRemoteConfigurationReadPort;
