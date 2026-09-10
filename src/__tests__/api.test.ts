import { Ai, BugbotReviewService } from '../api';
import type { Execution } from '../data/model/execution';

describe('Bugbot public API', () => {
  it('applies request-scoped options, emits telemetry, and restores shared configuration', async () => {
    const ai = new Ai('', '', false, [], false, 'low', 20, [], {
      findings: { provider: 'codex', model: '', command: '' },
      fixer: { provider: 'codex', model: '', command: '' },
    });
    const publish = jest.fn().mockResolvedValue(undefined);
    const service = new BugbotReviewService(
      { query: jest.fn() },
      {
        context: { issue: {}, pullRequest: {} } as never,
        publication: { issueComments: {}, pullRequestComments: {} } as never,
        resolution: { issueComments: {}, pullRequestComments: {} } as never,
        telemetry: { publish },
      },
    );
    const execution = {
      ai,
      owner: 'acme',
      repo: 'portable-project',
      issueNumber: -1,
      isPullRequest: false,
      pullRequest: { number: -1 },
    } as unknown as Execution;

    await expect(service.review(execution, {
      publicationMode: 'dry-run',
      effort: 'high',
      traceRules: true,
    })).resolves.toEqual([]);

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      repository: 'acme/portable-project',
      publicationMode: 'dry-run',
      configuredEffort: 'high',
      outcome: 'skipped',
    }));
    expect(ai.getBugbotReviewConfiguration()).toEqual(expect.objectContaining({
      publicationMode: 'publish',
      effort: 'default',
      traceRules: false,
    }));
  });
});
