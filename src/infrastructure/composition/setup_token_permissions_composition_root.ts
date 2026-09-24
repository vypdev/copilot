import { SetupTokenPermissionsUseCase } from '../../application/usecases/setup/setup_token_permissions_use_case';
import { SetupCredentialValidationAdapter } from '../setup_credential_validation_adapter';
import { SetupTokenPermissionQueryAdapter } from '../setup_token_permission_query_adapter';

export function createSetupTokenPermissionsUseCase(): SetupTokenPermissionsUseCase {
    return new SetupTokenPermissionsUseCase(
        new SetupCredentialValidationAdapter(),
        new SetupTokenPermissionQueryAdapter(),
    );
}
