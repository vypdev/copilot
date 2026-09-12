import { ApplicationError, BugbotReviewService, type BugbotReviewRequest } from '../api';
// @ts-expect-error The legacy aggregate is intentionally absent from the public API.
import type { Execution as RemovedExecution } from '../api';
// @ts-expect-error The legacy AI model is intentionally absent from the public API.
import type { Ai as RemovedAi } from '../api';

describe('Bugbot public API', () => {
  it('accepts only the request contract and emits request-scoped telemetry', async () => {
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
    const request: BugbotReviewRequest = {
      repository: { owner: 'acme', name: 'portable-project' },
      credential: { token: 'test-token' },
      target: { kind: 'branch', branch: 'feature/review' },
      agent: { provider: 'codex', model: '', command: '' },
      configuration: {
        publicationMode: 'dry-run',
        effort: 'high',
        traceRules: true,
      },
    };

    await expect(service.review(request)).resolves.toEqual([]);

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      repository: 'acme/portable-project',
      publicationMode: 'dry-run',
      configuredEffort: 'high',
      outcome: 'skipped',
    }));
    expect(request).toEqual(expect.objectContaining({
      target: { kind: 'branch', branch: 'feature/review' },
      configuration: expect.objectContaining({ publicationMode: 'dry-run' }),
    }));
  });

  it('rejects malformed public input with a semantic error', async () => {
    const service = new BugbotReviewService(
      { query: jest.fn() },
      {
        context: {} as never,
        publication: {} as never,
        resolution: {} as never,
      },
    );
    const review = service.review({
      repository: { owner: 'acme', name: 'repo' },
      credential: { token: 'test-token' },
      target: { kind: 'pull-request', number: 0, head: 'feature/review' },
      agent: { provider: 'codex', model: 'model', command: 'codex exec -' },
    });

    await expect(review).rejects.toMatchObject({
      name: 'ApplicationError',
      code: 'validation.invalid-input',
    });
    await review.catch((error: unknown) => {
      expect(error).toBeInstanceOf(ApplicationError);
    });
  });

  it('rejects JavaScript-only configuration shapes without exposing their values', async () => {
    const service = new BugbotReviewService(
      { query: jest.fn() },
      {
        context: {} as never,
        publication: {} as never,
        resolution: {} as never,
      },
    );
    const invalidRule = { token: 'gho_private-provider-value' };
    const review = service.review({
      repository: { owner: 'acme', name: 'repo' },
      credential: { token: 'test-token' },
      target: { kind: 'branch', branch: 'feature/review' },
      agent: { provider: 'codex', model: 'model', command: 'codex exec -' },
      configuration: { organizationRules: [invalidRule] },
    } as unknown as BugbotReviewRequest);

    await expect(review).rejects.toMatchObject({
      code: 'configuration.invalid',
      message: 'Bugbot organization rules are invalid.',
    });
    await review.catch((error: unknown) => {
      expect(JSON.stringify(error)).not.toContain('gho_private-provider-value');
    });
  });
});

const verifyRemovedApiAtCompileTime = (): void => {
  const service = null as unknown as BugbotReviewService;
  const execution = null as unknown as RemovedExecution;
  void (null as unknown as RemovedAi);
  // @ts-expect-error The removed review(Execution, options) overload must not compile.
  void service.review(execution, {});
};
void verifyRemovedApiAtCompileTime;
