const mockComposeInitialSetupUseCase = jest.fn(
  (..._dependencies: unknown[]) => ({ taskId: 'composed' }),
);
const mockLabelProvisioningClient = { capability: 'label-provisioning-client' };
const mockLabelProvisioning = { ensureInitialLabels: jest.fn() };
const mockCreateIssueLabelProvisioningClient = jest.fn(
  () => mockLabelProvisioningClient,
);
const mockIssueLabelProvisioningRepository = jest.fn(
  (_client: unknown) => mockLabelProvisioning,
);

jest.mock('../initial_setup_use_case_composition', () => ({
  composeInitialSetupUseCase: (...dependencies: unknown[]) =>
    mockComposeInitialSetupUseCase(...dependencies),
}));

jest.mock('../github_issue_client_factory', () => ({
  createIssueLabelProvisioningClient: () =>
    mockCreateIssueLabelProvisioningClient(),
}));

jest.mock('../../../data/repository/issue/issue_label_provisioning_repository', () => ({
  IssueLabelProvisioningRepository: mockIssueLabelProvisioningRepository,
}));

jest.mock('../../../data/repository/issue/issue_progress_label_repository', () => ({
  IssueProgressLabelRepository: jest.fn(() => {
    throw new Error('initial setup must not compose progress-label assignment');
  }),
}));

import { createInitialSetupCompositionRoot } from '../initial_setup_composition_root';

describe('initial setup composition root', () => {
  beforeEach(() => {
    mockComposeInitialSetupUseCase.mockClear();
    mockCreateIssueLabelProvisioningClient.mockClear();
    mockIssueLabelProvisioningRepository.mockClear();
  });

    it('injects one initial-label provisioning capability and repository-variable provisioning', () => {
    const composed = createInitialSetupCompositionRoot();

    expect(composed).toEqual({ taskId: 'composed' });
    expect(mockCreateIssueLabelProvisioningClient).toHaveBeenCalledTimes(1);
    expect(mockIssueLabelProvisioningRepository).toHaveBeenCalledTimes(1);
    expect(mockIssueLabelProvisioningRepository).toHaveBeenCalledWith(
      mockLabelProvisioningClient,
    );
    expect(mockComposeInitialSetupUseCase).toHaveBeenCalledTimes(1);
    const dependencies = mockComposeInitialSetupUseCase.mock.calls[0];
    expect(dependencies).toHaveLength(9);
    expect(dependencies[1]).toBe(mockLabelProvisioning);
  });
});
