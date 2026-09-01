const authenticatedUserPort = { kind: 'authenticated-user-port' };
const admissionUseCase = { kind: 'github-execution-admission-use-case' };

const createAuthenticatedUserCompositionRoot = jest.fn(() => authenticatedUserPort);
const resolveGithubExecutionAdmissionUseCase = jest.fn(() => admissionUseCase);

jest.mock('../authenticated_user_composition_root', () => ({
  createAuthenticatedUserCompositionRoot,
}));
jest.mock('../../../application/usecases/execution/resolve_github_execution_admission_use_case', () => ({
  ResolveGithubExecutionAdmissionUseCase: resolveGithubExecutionAdmissionUseCase,
}));

import { createGithubExecutionAdmissionUseCase } from '../github_execution_admission_composition_root';

describe('GitHub execution admission composition root', () => {
  beforeEach(() => jest.clearAllMocks());

  it('binds the authenticated-user port to the admission use case', () => {
    expect(createGithubExecutionAdmissionUseCase()).toBe(admissionUseCase);
    expect(resolveGithubExecutionAdmissionUseCase).toHaveBeenCalledWith(authenticatedUserPort);
    expect(createAuthenticatedUserCompositionRoot).toHaveBeenCalledTimes(1);
  });
});
