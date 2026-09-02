import { SetupCredentialsUseCase } from '../../application/usecases/setup/setup_credentials_use_case';
import type { SetupCredentialPromptPort } from '../../application/ports/setup_wizard_ports';
export declare function createSetupCredentialsUseCase(prompt: SetupCredentialPromptPort): SetupCredentialsUseCase;
