import { SetupTokenPermissionsUseCase } from '../../application/usecases/setup/setup_token_permissions_use_case';
import { SetupCredentialValidationAdapter } from '../setup_credential_validation_adapter';
import { SetupTokenPermissionQueryAdapter } from '../setup_token_permission_query_adapter';
import type { SetupTokenPermissionPresenterPort } from '../../application/ports/setup_token_permission_ports';

export function createSetupTokenPermissionsUseCase(presenter?: SetupTokenPermissionPresenterPort): SetupTokenPermissionsUseCase {
    return new SetupTokenPermissionsUseCase(
        new SetupCredentialValidationAdapter(),
        new SetupTokenPermissionQueryAdapter(),
        presenter?.showProgress ? progress => presenter.showProgress!(progress) : undefined,
    );
}
