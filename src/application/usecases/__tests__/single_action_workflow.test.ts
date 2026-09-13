import { Result } from '../../../data/model/result';
import {
  runSingleActionWorkflow,
  type SingleActionWorkflowPorts,
} from '../single_action_workflow';

jest.mock('../../ports/logging_ports', () => ({
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

type DispatchKind = Exclude<
  Parameters<typeof runSingleActionWorkflow>[0]['kind'],
  'invalid'
>;

function workflowPorts(result: Result): {
  readonly ports: SingleActionWorkflowPorts;
  readonly invokes: Readonly<Record<DispatchKind, jest.Mock>>;
} {
  const invokes = {
    'publish-github-action': jest.fn().mockResolvedValue([result]),
    'create-release': jest.fn().mockResolvedValue([result]),
    'create-tag': jest.fn().mockResolvedValue([result]),
    think: jest.fn().mockResolvedValue([result]),
    'initial-setup': jest.fn().mockResolvedValue([result]),
    'check-progress': jest.fn().mockResolvedValue([result]),
    'detect-potential-problems': jest.fn().mockResolvedValue([result]),
    'recommend-steps': jest.fn().mockResolvedValue({ results: [result] }),
    'close-inactive-issues': jest.fn().mockResolvedValue([result]),
    'publish-issue-comment': jest.fn().mockResolvedValue([result]),
    'observe-branch-sync': jest.fn().mockResolvedValue([result]),
    'deployment-orchestration': jest.fn().mockResolvedValue([result]),
  } satisfies Record<DispatchKind, jest.Mock>;
  return {
    invokes,
    ports: {
      publishGithubActionUseCase: { invoke: invokes['publish-github-action'] },
      createReleaseUseCase: { invoke: invokes['create-release'] },
      createTagUseCase: { invoke: invokes['create-tag'] },
      thinkUseCase: { invoke: invokes.think },
      initialSetupUseCase: { invoke: invokes['initial-setup'] },
      checkProgressUseCase: { invoke: invokes['check-progress'] },
      detectPotentialProblemsUseCase: { invoke: invokes['detect-potential-problems'] },
      recommendStepsUseCase: { invoke: invokes['recommend-steps'] },
      closeInactiveIssuesUseCase: { invoke: invokes['close-inactive-issues'] },
      publishIssueCommentUseCase: { invoke: invokes['publish-issue-comment'] },
      observeBranchSyncUseCase: { invoke: invokes['observe-branch-sync'] },
      deploymentOrchestrationUseCase: { invoke: invokes['deployment-orchestration'] },
    } as unknown as SingleActionWorkflowPorts,
  };
}

describe('single-action workflow', () => {
  const result = new Result({ id: 'result', success: true, executed: true, steps: [] });

  it.each([
    'publish-github-action',
    'create-release',
    'create-tag',
    'think',
    'initial-setup',
    'check-progress',
    'detect-potential-problems',
    'recommend-steps',
    'close-inactive-issues',
    'publish-issue-comment',
    'observe-branch-sync',
    'deployment-orchestration',
  ] as const)('dispatches the %s capability with only its projected input', async (kind) => {
    const { ports, invokes } = workflowPorts(result);
    const input = Object.freeze({ marker: kind });

    const outcome = await runSingleActionWorkflow({ kind, action: kind, input } as never, 'SingleActionUseCase', ports);

    expect(invokes[kind]).toHaveBeenCalledWith(input);
    expect(outcome.results).toEqual([result]);
    expect(Object.isFrozen(outcome.results)).toBe(true);
  });

  it('returns an immutable recommendation patch to the owning route', async () => {
    const { ports, invokes } = workflowPorts(result);
    invokes['recommend-steps'].mockResolvedValue({
      results: [result],
      configurationPatch: {
        recommendationState: {
          issueDescriptionFingerprint: 'description',
          recommendationFingerprint: 'recommendation',
          recommendation: 'Do this',
        },
      },
    });

    const outcome = await runSingleActionWorkflow({
      kind: 'recommend-steps', action: 'recommend_steps', input: {},
    } as never, 'SingleActionUseCase', ports);

    expect(outcome.configurationPatch).toEqual({
      recommendationState: {
        issueDescriptionFingerprint: 'description',
        recommendationFingerprint: 'recommendation',
        recommendation: 'Do this',
      },
    });
    expect(Object.isFrozen(outcome.configurationPatch)).toBe(true);
  });

  it('returns no result for an invalid dispatch without invoking a capability', async () => {
    const { ports, invokes } = workflowPorts(result);

    const outcome = await runSingleActionWorkflow(
      { kind: 'invalid', action: 'unknown' },
      'SingleActionUseCase',
      ports,
    );

    expect(outcome.results).toEqual([]);
    Object.values(invokes).forEach(invoke => expect(invoke).not.toHaveBeenCalled());
  });

  it('preserves the existing no-op when an optional surface capability is unavailable', async () => {
    const { ports } = workflowPorts(result);
    const withoutRelease = { ...ports, createReleaseUseCase: undefined };

    const outcome = await runSingleActionWorkflow({
      kind: 'create-release', action: 'create_release', input: {},
    } as never, 'SingleActionUseCase', withoutRelease);

    expect(outcome.results).toEqual([]);
  });

  it('maps a thrown capability failure to one semantic terminal result', async () => {
    const { ports, invokes } = workflowPorts(result);
    invokes.think.mockRejectedValue(new Error('provider detail'));

    const outcome = await runSingleActionWorkflow({
      kind: 'think', action: 'think', input: {},
    } as never, 'SingleActionUseCase', ports);

    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0]).toMatchObject({ success: false, executed: true });
    expect(outcome.results[0].errors[0]).toMatchObject({ code: 'workflow.failed' });
    expect(outcome.results[0].steps).toEqual(['Error executing single action: think.']);
  });
});
