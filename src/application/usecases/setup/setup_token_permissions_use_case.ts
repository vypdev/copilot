import type { SetupCredentialValidationPort } from '../../ports/setup_wizard_ports';
import type {
    SetupTokenPermissionQueryPort,
    SetupTokenPermissionsRequest,
} from '../../ports/setup_token_permission_ports';
import type {
    SetupTokenPermissionCheck,
    SetupTokenPermissionReport,
} from '../../../domain/setup_token_permissions';

/** Validates PAT identity first, then runs only read-only permission probes. */
export class SetupTokenPermissionsUseCase {
    constructor(
        private readonly credentials: Pick<SetupCredentialValidationPort, 'validateSetupPat'>,
        private readonly permissions: SetupTokenPermissionQueryPort,
    ) {}

    async inspect(request: SetupTokenPermissionsRequest): Promise<SetupTokenPermissionReport> {
        const identity = await this.credentials.validateSetupPat(request.owner, request.repository, request.token);
        if (identity.status !== 'valid') {
            const checks = request.requirements.map<SetupTokenPermissionCheck>((requirement) => ({
                ...requirement,
                status: identity.status === 'invalid' ? 'missing' : 'unverifiable',
                message: identity.status === 'invalid'
                    ? 'The token identity or repository selection was rejected.'
                    : 'Permission checks could not run until token identity and repository access are verified.',
            }));
            return {
                role: request.role,
                ...(identity.account ? { account: identity.account } : {}),
                identityStatus: identity.status === 'invalid' ? 'invalid' : 'unverifiable',
                identityMessage: identity.message,
                checks,
                ready: false,
                confirmationRequired: false,
            };
        }

        const byId = new Map((await this.permissions.inspect(
            request.owner,
            request.repository,
            request.token,
            request.requirements,
        )).map(check => [check.id, check]));
        const checks = request.requirements.map<SetupTokenPermissionCheck>(requirement => byId.get(requirement.id) ?? ({
            ...requirement,
            status: 'unverifiable',
            message: 'No safe permission evidence was returned for this requirement.',
        }));
        const requiredChecks = checks.filter(check => check.applicability === 'required');
        const ready = requiredChecks.every(check => check.status === 'verified');
        const confirmationRequired = !ready
            && requiredChecks.every(check => check.status === 'verified'
                || (check.level === 'write' && check.status === 'unverifiable'))
            && requiredChecks.some(check => check.level === 'write' && check.status === 'unverifiable');
        return {
            role: request.role,
            ...(identity.account ? { account: identity.account } : {}),
            identityStatus: 'valid',
            identityMessage: identity.message,
            checks,
            ready,
            confirmationRequired,
        };
    }
}
