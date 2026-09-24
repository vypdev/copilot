import type { SetupCredentialValidationPort } from '../../ports/setup_wizard_ports';
import type {
    SetupTokenPermissionQueryPort,
    SetupTokenPermissionsRequest,
} from '../../ports/setup_token_permission_ports';
import type {
    SetupTokenPermissionCheck,
    SetupTokenPermissionReport,
} from '../../../domain/setup_token_permissions';
import {
    isOperationallyAvailableSetupRead,
    reconcileSetupTokenPermissionEvidence,
} from '../../policies/setup_token_permission_evidence_policy';

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

        const evidence = await this.permissions.inspect(
            request.owner,
            request.repository,
            request.token,
            request.requirements,
        );
        const checks = reconcileSetupTokenPermissionEvidence(request.requirements, evidence);
        const requiredChecks = checks.filter(check => check.applicability === 'required');
        const requiredReads = requiredChecks.filter(check => check.level === 'read');
        const requiredWrites = requiredChecks.filter(check => check.level === 'write');
        const readUsable = (check: SetupTokenPermissionCheck) => (check.status === 'verified' && check.level === 'read')
            || (check.status === 'unverifiable' && check.level === 'read'
                && isOperationallyAvailableSetupRead(check)
                && check.operationallyAvailable === true);
        const readsUsable = requiredReads.every(readUsable);
        const ready = readsUsable && requiredWrites.length === 0;
        const confirmationRequired = readsUsable
            && requiredWrites.length > 0
            && requiredWrites.every(check => check.status === 'unverifiable');
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
