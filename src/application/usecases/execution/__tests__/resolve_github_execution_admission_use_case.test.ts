import type { AuthenticatedUserPort } from '../../../ports/authenticated_user_ports';
import {
    ResolveGithubExecutionAdmissionUseCase,
    type GithubExecutionAdmissionRequest,
} from '../resolve_github_execution_admission_use_case';

const getUserFromToken = jest.fn();

function request(overrides: Partial<GithubExecutionAdmissionRequest> = {}): GithubExecutionAdmissionRequest {
    return {
        actor: 'developer',
        token: 'token',
        isSingleAction: false,
        validSingleAction: false,
        ...overrides,
    };
}

describe('ResolveGithubExecutionAdmissionUseCase', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getUserFromToken.mockResolvedValue('copilot-bot');
    });

    it('resolves the PAT user once and returns an executable decision', async () => {
        const useCase = new ResolveGithubExecutionAdmissionUseCase({
            getUserFromToken,
        } as unknown as AuthenticatedUserPort);

        await expect(useCase.invoke(request())).resolves.toEqual({
            tokenUser: 'copilot-bot',
            decision: 'execute',
        });
        expect(getUserFromToken).toHaveBeenCalledWith('token');
    });

    it('returns discard for a normal run triggered by the PAT user', async () => {
        const useCase = new ResolveGithubExecutionAdmissionUseCase({
            getUserFromToken,
        } as unknown as AuthenticatedUserPort);

        await expect(useCase.invoke(request({ actor: 'copilot-bot' }))).resolves.toEqual({
            tokenUser: 'copilot-bot',
            decision: 'discard',
        });
    });

    it('preserves valid single actions for the PAT user', async () => {
        const useCase = new ResolveGithubExecutionAdmissionUseCase({
            getUserFromToken,
        } as unknown as AuthenticatedUserPort);

        await expect(useCase.invoke(request({
            actor: 'copilot-bot',
            isSingleAction: true,
            validSingleAction: true,
        }))).resolves.toEqual({
            tokenUser: 'copilot-bot',
            decision: 'execute',
        });
    });

    it('propagates identity lookup failures without admitting the run', async () => {
        const failure = new Error('identity lookup failed');
        getUserFromToken.mockRejectedValue(failure);
        const useCase = new ResolveGithubExecutionAdmissionUseCase({
            getUserFromToken,
        } as unknown as AuthenticatedUserPort);

        await expect(useCase.invoke(request())).rejects.toBe(failure);
    });

    it('fails closed when the identity lookup returns an empty login', async () => {
        getUserFromToken.mockResolvedValue('');
        const useCase = new ResolveGithubExecutionAdmissionUseCase({
            getUserFromToken,
        } as unknown as AuthenticatedUserPort);

        await expect(useCase.invoke(request())).rejects.toThrow('Failed to get user from token');
    });
});
