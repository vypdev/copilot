import {
  projectConfigurationPersistenceContext,
  StoreConfigurationUseCase,
} from '../store_configuration_use_case';
import type { ConfigurationStorePort } from '../../../../ports/configuration_store_ports';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockUpdate = jest.fn();
describe('StoreConfigurationUseCase', () => {
  let useCase: StoreConfigurationUseCase;

  beforeEach(() => {
    useCase = new StoreConfigurationUseCase({ update: mockUpdate } as unknown as ConfigurationStorePort);
    mockUpdate.mockReset();
  });

  it('calls handler.update with param', async () => {
    const param = { issueNumber: 7, currentConfiguration: { branchType: 'feature' } };

    await useCase.invoke(param);

    expect(mockUpdate).toHaveBeenCalledWith(param);
  });

  it('fails the action when configuration persistence throws', async () => {
    mockUpdate.mockRejectedValue(new Error('Update failed'));

    await expect(useCase.invoke({} as Parameters<StoreConfigurationUseCase['invoke']>[0]))
      .rejects.toThrow('Configuration persistence failed.');
  });

  it.each([
    [{ isSingleAction: true, isIssue: true, issue: { number: 1 } }, 1],
    [{ isSingleAction: true, isPullRequest: true, pullRequest: { number: 2 } }, 2],
    [{ isSingleAction: true, isPush: true, issueNumber: 3 }, 3],
    [{ isSingleAction: true, singleAction: { issue: 4 } }, 4],
    [{ isSingleAction: true, singleAction: { issue: 0 } }, undefined],
    [{ isPush: true, issueNumber: 5 }, 5],
    [{ isPush: true, issueNumber: 0 }, undefined],
    [{}, undefined],
  ])('resolves a persistence target before storage: %j', (route, expected) => {
    const context = projectConfigurationPersistenceContext({
      isSingleAction: false,
      isIssue: false,
      isPullRequest: false,
      isPush: false,
      issueNumber: -1,
      issue: { number: -1 },
      pullRequest: { number: -1 },
      singleAction: { issue: -1 },
      currentConfiguration: { branchType: 'feature' },
      ...route,
    });

    expect(context?.issueNumber).toBe(expected);
  });
});
