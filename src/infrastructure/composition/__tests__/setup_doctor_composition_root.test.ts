import { SetupDoctorUseCase } from '../../../application/usecases/setup/doctor_use_case';
import { SetupMergeQueueReadinessUseCase } from '../../../application/usecases/setup/merge_queue_readiness_use_case';
import {
  createSetupDoctorUseCase,
  createSetupMergeQueueReadinessUseCase,
} from '../setup_doctor_composition_root';

describe('setup doctor composition root', () => {
  it('constructs the doctor and default merge-queue readiness application services', () => {
    expect(createSetupDoctorUseCase()).toBeInstanceOf(SetupDoctorUseCase);
    expect(createSetupMergeQueueReadinessUseCase()).toBeInstanceOf(SetupMergeQueueReadinessUseCase);
  });

  it('accepts an injected catalog resolver for merge-queue readiness', () => {
    const resolver = { resolve: jest.fn() };

    expect(createSetupMergeQueueReadinessUseCase(resolver))
      .toBeInstanceOf(SetupMergeQueueReadinessUseCase);
  });
});
