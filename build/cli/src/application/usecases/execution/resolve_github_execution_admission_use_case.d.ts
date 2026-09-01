import type { AuthenticatedUserPort } from '../../ports/authenticated_user_ports';
import type { ParamUseCase } from '../base/param_usecase';
import { type GithubExecutionAdmissionDecision } from '../../policies/github_execution_admission_policy';
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
export declare class ResolveGithubExecutionAdmissionUseCase implements ParamUseCase<GithubExecutionAdmissionRequest, GithubExecutionAdmissionResult> {
    private readonly authenticatedUserPort;
    taskId: string;
    constructor(authenticatedUserPort: AuthenticatedUserPort);
    invoke(request: GithubExecutionAdmissionRequest): Promise<GithubExecutionAdmissionResult>;
}
