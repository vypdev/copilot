import {
  ApplicationError,
  BugbotReviewService,
  type BugbotReviewRequest,
  type BugbotScmGateway,
} from '../api';
// @ts-expect-error The legacy aggregate is intentionally absent from the public API.
import type { Execution as RemovedExecution } from '../api';
// @ts-expect-error The legacy AI model is intentionally absent from the public API.
import type { Ai as RemovedAi } from '../api';

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type ReviewRequestKeysAreExact = Assert<Equal<
  keyof BugbotReviewRequest,
  | 'target'
  | 'agent'
  | 'configuration'
  | 'ignoreFiles'
  | 'minimumSeverity'
  | 'commentLimit'
  | 'authenticatedUser'
  | 'locale'
>>;

describe('Bugbot public API', () => {
  it('accepts only the request contract and emits request-scoped telemetry', async () => {
    const publish = jest.fn().mockResolvedValue(undefined);
    const service = new BugbotReviewService(
      { query: jest.fn() },
      {
        repository: { owner: 'acme', name: 'portable-project' },
        telemetry: { publish },
      } as unknown as BugbotScmGateway,
    );
    const request: BugbotReviewRequest = {
      target: { kind: 'branch', branch: 'feature/review' },
      agent: { provider: 'codex', model: '' },
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
      { repository: { owner: 'acme', name: 'repo' } } as BugbotScmGateway,
    );
    const review = service.review({
      target: { kind: 'pull-request', number: 0, head: 'feature/review' },
      agent: { provider: 'codex', model: 'model' },
    });

    await expect(review).rejects.toMatchObject({
      name: 'ApplicationError',
      code: 'validation.invalid-input',
    });
    await review.catch((error: unknown) => {
      expect(error).toBeInstanceOf(ApplicationError);
    });
  });

  it('rejects a gateway that does not declare its bound repository identity', async () => {
    const service = new BugbotReviewService(
      { query: jest.fn() },
      {} as BugbotScmGateway,
    );

    await expect(service.review({
      target: { kind: 'branch', branch: 'feature/review' },
      agent: { provider: 'codex', model: 'model' },
    })).rejects.toMatchObject({
      code: 'validation.invalid-input',
      message: 'Bound repository owner is missing or invalid.',
    });
  });

  it('rejects JavaScript-only configuration shapes without exposing their values', async () => {
    const service = new BugbotReviewService(
      { query: jest.fn() },
      { repository: { owner: 'acme', name: 'repo' } } as BugbotScmGateway,
    );
    const invalidRule = { token: 'gho_private-provider-value' };
    const review = service.review({
      target: { kind: 'branch', branch: 'feature/review' },
      agent: { provider: 'codex', model: 'model' },
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
  const requestWithCredential: BugbotReviewRequest = {
    target: { kind: 'branch', branch: 'feature/review' },
    agent: { provider: 'codex', model: 'model' },
    // @ts-expect-error Provider authority belongs to the already-bound gateway.
    credential: { token: 'secret' },
  };
  const requestWithRepository: BugbotReviewRequest = {
    target: { kind: 'branch', branch: 'feature/review' },
    agent: { provider: 'codex', model: 'model' },
    // @ts-expect-error Repository identity belongs to the already-bound gateway.
    repository: { owner: 'acme', name: 'repo' },
  };
  void requestWithCredential;
  void requestWithRepository;
};
void verifyRemovedApiAtCompileTime;
void (null as unknown as ReviewRequestKeysAreExact);
