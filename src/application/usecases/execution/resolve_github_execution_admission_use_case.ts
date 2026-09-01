import type { AuthenticatedUserPort } from '../../ports/authenticated_user_ports';
import type { ParamUseCase } from '../base/param_usecase';
import {
    resolveGithubExecutionAdmission,
    type GithubExecutionAdmissionDecision,
} from '../../policies/github_execution_admission_policy';

export interface GithubExecutionAdmissionRequest {
    actor: string;
    token: string;
    isSingleAction: boolean;
    validSingleAction: boolean;
}

export interface GithubExecutionAdmissionResult {
    decision: GithubExecutionAdmissionDecision;
    tokenUser: string;
}

export class ResolveGithubExecutionAdmissionUseCase implements ParamUseCase<GithubExecutionAdmissionRequest, GithubExecutionAdmissionResult> {
    taskId = 'ResolveGithubExecutionAdmissionUseCase';

    constructor(private readonly authenticatedUserPort: AuthenticatedUserPort) {}

    async invoke(request: GithubExecutionAdmissionRequest): Promise<GithubExecutionAdmissionResult> {
        const tokenUser = await this.authenticatedUserPort.getUserFromToken(request.token);
        if (typeof tokenUser !== 'string' || tokenUser.trim().length === 0) {
            throw new Error('Failed to get user from token');
        }

        return {
            tokenUser,
            decision: resolveGithubExecutionAdmission({
                actor: request.actor,
                tokenUser,
                isSingleAction: request.isSingleAction,
                validSingleAction: request.validSingleAction,
            }),
        };
    }
}
