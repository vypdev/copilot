import { ResolveGithubExecutionAdmissionUseCase } from '../../application/usecases/execution/resolve_github_execution_admission_use_case';
import { createAuthenticatedUserCompositionRoot } from './authenticated_user_composition_root';

export function createGithubExecutionAdmissionUseCase(): ResolveGithubExecutionAdmissionUseCase {
    return new ResolveGithubExecutionAdmissionUseCase(createAuthenticatedUserCompositionRoot());
}
