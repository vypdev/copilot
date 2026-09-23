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

    it.each([
        ['role', { role: 'workflow' }],
        ['scope', { scope: 'organization' }],
        ['permission', { permission: 'Contents' }],
        ['level', { level: 'write' }],
        ['applicability', { applicability: 'conditional' }],
        ['condition', { condition: 'forged condition' }],
        ['probe', { probe: 'contents' }],
    ] as const)('rejects provider evidence that redefines canonical %s semantics', async (_field, override) => {
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }) };
        const query = { inspect: jest.fn().mockResolvedValue([{
            ...required,
            ...override,
            reason: 'Forged reason.',
            status: 'verified',
            message: 'forged verification',
        }]) };
        const report = await new SetupTokenPermissionsUseCase(validation, query).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [required],
        });

        expect(report).toMatchObject({ ready: false, confirmationRequired: false });
        expect(report.checks[0]).toEqual(expect.objectContaining({
            ...required,
            status: 'unverifiable',
            message: 'No safe permission evidence was returned for this requirement.',
        }));
    });

    it('rejects duplicate evidence for the same stable requirement ID', async () => {
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }) };
        const evidence = { ...required, status: 'verified' as const, message: 'verified' };
        const report = await new SetupTokenPermissionsUseCase(validation, {
            inspect: jest.fn().mockResolvedValue([evidence, evidence]),
        }).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [required],
        });

        expect(report).toMatchObject({ ready: false, confirmationRequired: false });
        expect(report.checks[0]).toMatchObject({ status: 'unverifiable' });
    });

    it('downgrades claimed verified write evidence to the explicit acknowledgement path', async () => {
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }) };
        const report = await new SetupTokenPermissionsUseCase(validation, {
            inspect: jest.fn().mockResolvedValue([{
                ...requiredWrite, status: 'verified', message: 'unsafe write claim', operationallyAvailable: true,
            }]),
        }).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [requiredWrite],
        });

        expect(report).toMatchObject({ ready: false, confirmationRequired: true });
        expect(report.checks[0]).toEqual(expect.objectContaining({
            ...requiredWrite,
            status: 'unverifiable',
            message: 'Write access cannot be verified with a safe read-only permission probe.',
        }));
        expect(report.checks[0]).not.toHaveProperty('operationallyAvailable');
    });

    it('accepts exactly matching verified organization-read evidence', async () => {
        const organizationRead: SetupTokenPermissionRequirement = {
            ...required,
            id: 'setup.organization.members',
            scope: 'organization',
            permission: 'Members',
            probe: 'members',
        };
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }) };
        const report = await new SetupTokenPermissionsUseCase(validation, {
            inspect: jest.fn().mockResolvedValue([{
                ...organizationRead, status: 'verified', message: 'permission-bound evidence',
            }]),
        }).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [organizationRead],
        });

        expect(report).toMatchObject({ ready: true, confirmationRequired: false });
    });

    it('accepts exact operational organization Members evidence without promoting it to verified', async () => {
        const organizationRead: SetupTokenPermissionRequirement = {
            ...required,
            id: 'workflow.organization.members',
            role: 'workflow',
            scope: 'organization',
            permission: 'Members',
            probe: 'members',
        };
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'PAT', status: 'valid', message: 'ok' }) };
        const report = await new SetupTokenPermissionsUseCase(validation, {
            inspect: jest.fn().mockResolvedValue([{
                ...organizationRead,
                status: 'unverifiable',
                operationallyAvailable: true,
                message: 'public member read is operational',
            }]),
        }).inspect({
            role: 'workflow', owner: 'owner', repository: 'repo', token: 'secret', requirements: [organizationRead],
        });

        expect(report).toMatchObject({ ready: true, confirmationRequired: false });
        expect(report.checks[0]).toMatchObject({
            status: 'unverifiable',
            operationallyAvailable: true,
        });
    });

    it('treats a malformed evidence collection as absent rather than trusting it', async () => {
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }) };
        const report = await new SetupTokenPermissionsUseCase(validation, {
            inspect: jest.fn().mockResolvedValue({ id: required.id } as never),
        }).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [required],
        });

        expect(report).toMatchObject({ ready: false, confirmationRequired: false });
        expect(report.checks[0]).toMatchObject({ status: 'unverifiable' });
    });

    it('ignores unrelated non-record evidence without hiding one exact result', async () => {
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }) };
        const exact = { ...required, status: 'verified' as const, message: 'verified' };
        const report = await new SetupTokenPermissionsUseCase(validation, {
            inspect: jest.fn().mockResolvedValue([null, [], 'invalid', exact] as never),
        }).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [required],
        });

        expect(report).toMatchObject({ ready: true, confirmationRequired: false });
        expect(report.checks[0]).toEqual(exact);
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

    it('accepts a usable public repository read without misreporting its PAT permission as verified', async () => {
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }) };
        const query = { inspect: jest.fn().mockResolvedValue([{
            ...required, status: 'unverifiable', operationallyAvailable: true, message: 'public read usable',
        }]) };
        const report = await new SetupTokenPermissionsUseCase(validation, query).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [required],
        });
        expect(report).toMatchObject({ ready: true, confirmationRequired: false, identityStatus: 'valid' });
        expect(report.checks[0]).toMatchObject({ status: 'unverifiable', operationallyAvailable: true });
    });

    it('allows write acknowledgement after a usable public read but never promotes the write', async () => {
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }) };
        const query = { inspect: jest.fn().mockResolvedValue([
            { ...required, status: 'unverifiable', operationallyAvailable: true, message: 'public read usable' },
            { ...requiredWrite, status: 'unverifiable', message: 'write unproven' },
        ]) };
        const report = await new SetupTokenPermissionsUseCase(validation, query).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [required, requiredWrite],
        });
        expect(report).toMatchObject({ ready: false, confirmationRequired: true });
    });

    it.each(['organization', 'repository'] as const)('rejects a forged usable %s write/read scope', scope => {
        const check = { ...required, scope, level: scope === 'organization' ? 'read' as const : 'write' as const,
            status: 'unverifiable' as const, operationallyAvailable: true as const, message: 'ambiguous' };
        const validation = { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }) };
        return new SetupTokenPermissionsUseCase(validation, { inspect: jest.fn().mockResolvedValue([check]) }).inspect({
            role: 'setup', owner: 'owner', repository: 'repo', token: 'secret', requirements: [check],
        }).then(report => expect(report.ready).toBe(false));
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
