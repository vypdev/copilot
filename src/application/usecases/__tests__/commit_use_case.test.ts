import { CommitUseCase } from '../commit_use_case';
import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';

jest.mock('../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockNotifyInvoke = jest.fn();
const mockCheckChangesInvoke = jest.fn();
const mockCheckProgressInvoke = jest.fn();
const mockDetectProblemsInvoke = jest.fn();

jest.mock('../steps/commit/notify_new_commit_on_issue_use_case', () => ({
  NotifyNewCommitOnIssueUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockNotifyInvoke,
  })),
}));

jest.mock('../steps/commit/check_changes_issue_size_use_case', () => ({
  CheckChangesIssueSizeUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockCheckChangesInvoke,
  })),
}));

jest.mock('../actions/check_progress_use_case', () => ({
  CheckProgressUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockCheckProgressInvoke,
  })),
}));

jest.mock('../steps/commit/detect_potential_problems_use_case', () => ({
  DetectPotentialProblemsUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockDetectProblemsInvoke,
  })),
}));

function minimalExecution(overrides: Record<string, unknown> = {}): Execution {
  return {
    commit: {
      commits: [{ id: 'c1', message: 'msg' }],
      branch: 'feature/123',
    },
    issueNumber: 123,
    ...overrides,
  } as unknown as Execution;
}

describe('CommitUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotifyInvoke.mockResolvedValue([]);
    mockCheckChangesInvoke.mockResolvedValue([]);
    mockCheckProgressInvoke.mockResolvedValue([]);
    mockDetectProblemsInvoke.mockResolvedValue([]);
  });

  it('returns empty results when commit has no commits', async () => {
    const useCase = new CommitUseCase(
      { invoke: mockNotifyInvoke } as any,
      { invoke: mockCheckChangesInvoke } as any,
      { invoke: mockDetectProblemsInvoke } as any,
      { invoke: mockCheckProgressInvoke } as any,
    );
    const param = minimalExecution({
      commit: { commits: [], branch: 'main' },
    });

    const results = await useCase.invoke(param);

    expect(results).toEqual([]);
    expect(mockNotifyInvoke).not.toHaveBeenCalled();
  });

  it('calls notify, check changes, check progress, detect problems in order and aggregates results', async () => {
    const r1 = new Result({ id: 'n', success: true, executed: true, steps: ['Notified'] });
    const r2 = new Result({ id: 'c', success: true, executed: true, steps: ['Checked'] });
    mockNotifyInvoke.mockResolvedValue([r1]);
    mockCheckChangesInvoke.mockResolvedValue([r2]);
    mockCheckProgressInvoke.mockResolvedValue([]);
    mockDetectProblemsInvoke.mockResolvedValue([]);

    const useCase = new CommitUseCase(
      { invoke: mockNotifyInvoke } as any,
      { invoke: mockCheckChangesInvoke } as any,
      { invoke: mockDetectProblemsInvoke } as any,
      { invoke: mockCheckProgressInvoke } as any,
    );
    const param = minimalExecution();
    const results = await useCase.invoke(param);

    expect(mockNotifyInvoke).toHaveBeenCalledWith(param);
    expect(mockCheckChangesInvoke).toHaveBeenCalledWith(param);
    expect(mockCheckProgressInvoke).toHaveBeenCalledWith(param);
    expect(mockDetectProblemsInvoke).toHaveBeenCalledWith(param);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('n');
    expect(results[1].id).toBe('c');
  });

  it('on error pushes failure result and rethrows', async () => {
    mockNotifyInvoke.mockRejectedValue(new Error('step failed'));

    const useCase = new CommitUseCase(
      { invoke: mockNotifyInvoke } as any,
      { invoke: mockCheckChangesInvoke } as any,
      { invoke: mockDetectProblemsInvoke } as any,
      { invoke: mockCheckProgressInvoke } as any,
    );
    const param = minimalExecution();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps).toContain('Error processing the commits.');
  });
});
