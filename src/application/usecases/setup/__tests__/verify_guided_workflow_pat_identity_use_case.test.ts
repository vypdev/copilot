import { VerifyGuidedWorkflowPatIdentityUseCase } from '../verify_guided_workflow_pat_identity_use_case';

describe('VerifyGuidedWorkflowPatIdentityUseCase', () => {
    const identities = {
        resolve: jest.fn(),
        identify: jest.fn(),
    };
    beforeEach(() => jest.clearAllMocks());

    it('accepts matching immutable IDs even when the login casing differs', async () => {
        identities.identify.mockResolvedValue({ id: 42, login: 'vypbot' });
        await expect(new VerifyGuidedWorkflowPatIdentityUseCase(identities)
            .execute({ id: 42, login: 'VypBot' }, 'workflow-token')).resolves.toEqual({ id: 42, login: 'VypBot' });
        expect(identities.identify).toHaveBeenCalledWith('workflow-token');
    });

    it('rejects another account without leaking either token', async () => {
        identities.identify.mockResolvedValue({ id: 99, login: 'operator' });
        await expect(new VerifyGuidedWorkflowPatIdentityUseCase(identities)
            .execute({ id: 42, login: 'vypbot' }, 'workflow-token')).rejects.toThrow('not the selected bot');
    });
});
