import { StoreConfigurationUseCase } from '../store_configuration_use_case';
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
    const param = { owner: 'o', repo: 'r' } as unknown as Parameters<StoreConfigurationUseCase['invoke']>[0];

    await useCase.invoke(param);

    expect(mockUpdate).toHaveBeenCalledWith(param);
  });

  it('does not throw when handler.update throws (caught and logged)', async () => {
    mockUpdate.mockRejectedValue(new Error('Update failed'));

    await expect(useCase.invoke({} as Parameters<StoreConfigurationUseCase['invoke']>[0])).resolves.not.toThrow();
  });
});
