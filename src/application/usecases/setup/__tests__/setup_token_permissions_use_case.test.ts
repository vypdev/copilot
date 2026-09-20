import { SetupTokenPermissionsUseCase } from '../setup_token_permissions_use_case';
import type { SetupTokenPermissionRequirement } from '../../../../domain/setup_token_permissions';

const required: SetupTokenPermissionRequirement = {
    id: 'setup.repository.metadata', role: 'setup', scope: 'repository', permission: 'Metadata',
    level: 'read', applicability: 'required', reason: 'Repository discovery.', probe: 'metadata',
};
const conditional: SetupTokenPermissionRequirement = {
    id: 'setup.repository.actions', role: 'setup', scope: 'repository', permission: 'Actions',
    level: 'write', applicability: 'conditional', condition: 'health enabled', reason: 'Health.', probe: 'actions',
};
const requiredWrite: SetupTokenPermissionRequirement = {
    ...conditional,
    id: 'setup.repository.actions-required',
    applicability: 'required',
    condition: undefined,
};

describe('SetupTokenPermissionsUseCase', () => {
    it('keeps report order even when the query returns reversed checks', async () => {
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok', account: 'operator' }) };
        const query = { inspect: jest.fn().mockResolvedValue([
            { ...conditional, status: 'unverifiable', message: 'unknown' },
            { ...required, status: 'verified', message: 'verified' },
        ]) };
        const report = await new SetupTokenPermissionsUseCase(validation, query).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [required, conditional],
        });
        expect(report.checks.map(check => check.id)).toEqual([required.id, conditional.id]);
        expect(report).toMatchObject({ ready: true, confirmationRequired: false, account: 'operator', identityStatus: 'valid' });
    });

    it('blocks a deterministically missing required permission', async () => {
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }) };
        const query = { inspect: jest.fn().mockResolvedValue([{ ...required, status: 'missing', message: 'denied' }]) };
        const report = await new SetupTokenPermissionsUseCase(validation, query).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [required],
        });
        expect(report).toMatchObject({ ready: false, confirmationRequired: false });
    });

    it('does not block on a missing conditional permission', async () => {
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }) };
        const query = { inspect: jest.fn().mockResolvedValue([{ ...conditional, status: 'missing', message: 'denied' }]) };
        const report = await new SetupTokenPermissionsUseCase(validation, query).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [conditional],
        });
        expect(report).toMatchObject({ ready: true, confirmationRequired: false });
    });

    it('does not probe permissions when token identity is invalid', async () => {
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'invalid', message: 'rejected', account: 'operator' }) };
        const query = { inspect: jest.fn() };
        const report = await new SetupTokenPermissionsUseCase(validation, query).inspect({
            role: 'workflow', owner: 'owner', repository: 'repo', token: 'secret', requirements: [required],
        });
        expect(query.inspect).not.toHaveBeenCalled();
        expect(report).toMatchObject({ ready: false, confirmationRequired: false, identityStatus: 'invalid', account: 'operator' });
        expect(report.checks[0]).toMatchObject({ status: 'missing' });
    });

    it('blocks absent provider evidence for a required read permission', async () => {
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }) };
        const report = await new SetupTokenPermissionsUseCase(validation, { inspect: jest.fn().mockResolvedValue([]) }).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [required],
        });
        expect(report).toMatchObject({ ready: false, confirmationRequired: false });
        expect(report.checks[0]).toMatchObject({ status: 'unverifiable' });
    });

    it('requires explicit confirmation when only required write evidence is unverifiable', async () => {
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }) };
        const query = { inspect: jest.fn().mockResolvedValue([
            { ...required, status: 'verified', message: 'verified' },
            { ...requiredWrite, status: 'unverifiable', message: 'no safe write proof' },
        ]) };
        const report = await new SetupTokenPermissionsUseCase(validation, query).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [required, requiredWrite],
        });

        expect(report).toMatchObject({ ready: false, confirmationRequired: true });
    });

    it('does not offer confirmation when a required write permission is missing', async () => {
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }) };
        const query = { inspect: jest.fn().mockResolvedValue([
            { ...requiredWrite, status: 'missing', message: 'denied' },
        ]) };
        const report = await new SetupTokenPermissionsUseCase(validation, query).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [requiredWrite],
        });

        expect(report).toMatchObject({ ready: false, confirmationRequired: false });
    });

    it('maps unverifiable identity to an inconclusive blocked report', async () => {
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'unverifiable', message: 'timeout' }) };
        const query = { inspect: jest.fn() };
        const report = await new SetupTokenPermissionsUseCase(validation, query).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [required],
        });
        expect(report).toMatchObject({ ready: false, confirmationRequired: false, identityStatus: 'unverifiable' });
        expect(report.checks[0]).toMatchObject({ status: 'unverifiable' });
    });
});
