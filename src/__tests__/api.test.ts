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
    const repository = { owner: 'acme', name: 'portable-project' };
    const service = new BugbotReviewService(
      { query: jest.fn() },
      {
        repository,
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
    repository.owner = 'mutated-owner';
    repository.name = 'mutated-project';

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
    expect(Object.isFrozen(
      (service as unknown as { repository: object }).repository,
    )).toBe(true);
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

  it('projects complete pull-request facts through the request-only API', async () => {
    const service = new BugbotReviewService(
      { query: jest.fn() },
      { repository: { owner: 'acme', name: 'repo' } } as BugbotScmGateway,
    );

    await expect(service.review({
      target: {
        kind: 'pull-request',
        number: 17,
        head: 'feature/review',
        base: 'master',
        linkedIssueNumber: 9,
        action: 'opened',
        expectedHeadSha: 'a'.repeat(40),
        before: 'b'.repeat(40),
        draft: true,
      },
      agent: { provider: 'codex', model: '' },
      authenticatedUser: 'vypbot',
    })).resolves.toEqual([]);
  });

  it('projects pull-request defaults and branch after identity', async () => {
    const service = new BugbotReviewService(
      { query: jest.fn() },
      { repository: { owner: 'acme', name: 'repo' } } as BugbotScmGateway,
    );
    const agent = { provider: 'codex' as const, model: '' };

    await expect(service.review({
      target: { kind: 'pull-request', number: 18, head: 'feature/defaults' },
      agent,
    })).resolves.toEqual([]);
    await expect(service.review({
      target: {
        kind: 'branch',
        branch: 'feature/after',
        after: 'c'.repeat(40),
      },
      agent,
    })).resolves.toEqual([]);
  });

  it.each([
    [undefined, 'Bound repository owner is missing or invalid.'],
    [{}, 'Bound repository owner is missing or invalid.'],
    [{ repository: { owner: 'acme' } }, 'Bound repository name is missing or invalid.'],
  ])('rejects a gateway without a complete bound repository identity', (gateway, message) => {
    expect(() => new BugbotReviewService(
      { query: jest.fn() },
      gateway as BugbotScmGateway,
    )).toThrow(expect.objectContaining({
      code: 'validation.invalid-input',
      message,
    }));
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
