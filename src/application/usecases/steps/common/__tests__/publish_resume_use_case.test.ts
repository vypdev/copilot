import { Result } from '../../../../../data/model/result';
import { PublishResultUseCase } from '../publish_resume_use_case';
import { projectPublishResultContext, type PublishResultContextSource } from '../publish_resume_workflow';
import type { IssueCommentPublicationTarget } from '../../../../ports/issue_lifecycle_ports';

function recommendation(steps = '1. Add the policy\n2. Add tests', fingerprint = 'a'.repeat(16)): Result {
  return new Result({
    id: 'RecommendStepsUseCase', success: true, executed: true,
    payload: {
      issueNumber: 42,
      recommendedSteps: steps,
      recommendationState: { issueDescriptionFingerprint: fingerprint },
    },
    steps: ['legacy plan wrapper that must never be published'],
  });
}

function progress(value = 65, summary = 'Core behavior is implemented.', remaining = 'Finish validation.'): Result {
  return new Result({
    id: 'CheckProgressUseCase', success: true, executed: true,
    payload: { issueNumber: 42, progress: value, summary, remaining, branch: 'feature/work', developmentBranch: 'develop' },
    steps: ['legacy progress wrapper that must never be published'],
  });
}

function source(results: Result[], overrides: Partial<PublishResultContextSource> = {}): PublishResultContextSource {
  return {
    owner: 'acme', repo: 'widgets', tokenUser: 'vypbot', isPullRequest: false,
    eventName: 'issues', issueNumber: 42, issue: { number: 42 }, pullRequest: { number: -1 }, inputs: { action: 'opened' },
    locale: { issue: 'en-US', pullRequest: 'en-US' },
    currentConfiguration: { results },
    ...overrides,
  };
}

function inMemoryComments(initial: IssueCommentPublicationTarget[] = []) {
  const values = initial.map(comment => ({ ...comment }));
  let nextId = Math.max(0, ...values.map(comment => comment.id)) + 1;
  return {
    values,
    addComment: jest.fn(async (_issueNumber: number, body: string) => {
      values.push({ id: nextId++, body, user: { login: 'vypbot' } });
    }),
    updateComment: jest.fn(async (_issueNumber: number, id: number, body: string) => {
      const comment = values.find(candidate => candidate.id === id);
      if (comment) comment.body = body;
    }),
    listIssueComments: jest.fn(async () => values.map(comment => ({ ...comment }))),
  };
}

describe('PublishResultUseCase semantic compatibility boundary', () => {
  it.each([
    new Result({ id: 'metadata', success: true, executed: true, steps: ['Waiting state cleared.'] }),
    new Result({ id: 'failure', success: false, executed: true, errors: [] }),
    new Result({ id: 'reminder', success: true, executed: true, reminders: ['Internal reminder'] }),
    new Result({ id: 'Bugbot', success: true, executed: true, steps: ['Review complete'] }),
  ])('keeps legacy result evidence out of GitHub conversations', async (result) => {
    const comments = inMemoryComments();

    await new PublishResultUseCase(comments).invoke(projectPublishResultContext(source([result])));

    expect(comments.listIssueComments).not.toHaveBeenCalled();
    expect(comments.addComment).not.toHaveBeenCalled();
    expect(comments.updateComment).not.toHaveBeenCalled();
  });

  it('creates one concise implementation-plan card without retired chrome', async () => {
    const comments = inMemoryComments();

    await new PublishResultUseCase(comments).invoke(projectPublishResultContext(source([recommendation()])));

    expect(comments.addComment).toHaveBeenCalledTimes(1);
    expect(comments.values).toHaveLength(1);
    expect(comments.values[0].body).toContain('topic="plan" target="issue:42"');
    expect(comments.values[0].body).toContain('## Implementation plan');
    expect(comments.values[0].body).toContain('1. Add the policy');
    expect(comments.values[0].body).not.toMatch(/Automatic Actions|Feature Actions|Debug log|Happy coding|giphy|Made with/u);
  });

  it('publishes an explicit help reply once without reviving generic step publication', async () => {
    const comments = inMemoryComments();
    const result = new Result({
      id: 'Comment.Help', success: true, executed: true,
      steps: ['legacy wrapper'],
      payload: { publication: { kind: 'help', botLogin: 'vypbot' } },
    });
    const value = projectPublishResultContext(source([result], {
      eventName: 'issue_comment', inputs: { action: 'created', comment: { id: 99 } },
    }));

    await new PublishResultUseCase(comments).invoke(value);
    await new PublishResultUseCase(comments).invoke(value);

    expect(comments.addComment).toHaveBeenCalledTimes(1);
    expect(comments.values[0].body).toContain('correlation="comment:99"');
    expect(comments.values[0].body).toContain('## Copilot commands');
    expect(comments.values[0].body).not.toContain('legacy wrapper');
  });

  it('recognizes a reply marker written before review-comment correlation was namespaced', async () => {
    const comments = inMemoryComments([{
      id: 7,
      user: { login: 'vypbot' },
      body: '<!-- copilot:reply schema="1" target="issue:42" correlation="comment:99" key="copilot-help" digest="0123abcd" -->\n\nExisting response.',
    }]);
    const result = new Result({
      id: 'Comment.Help', success: true, executed: true,
      payload: { publication: { kind: 'help', botLogin: 'vypbot' } },
    });

    await new PublishResultUseCase(comments).invoke(projectPublishResultContext(source([result], {
      eventName: 'issue_comment', inputs: { action: 'created', comment: { id: 99 } },
    })));

    expect(comments.addComment).not.toHaveBeenCalled();
    expect(comments.updateComment).not.toHaveBeenCalled();
    expect(comments.values).toHaveLength(1);
  });

  it('namespaces equal numeric comment ids by GitHub transport', () => {
    const issueComment = projectPublishResultContext(source([], {
      eventName: 'issue_comment', inputs: { action: 'created', comment: { id: 99 } },
    }));
    const reviewComment = projectPublishResultContext(source([], {
      eventName: 'pull_request_review_comment', inputs: { action: 'created', pull_request_review_comment: { id: 99 } },
    }));

    expect(issueComment.requestCorrelationId).toBe('comment:99');
    expect(reviewComment.requestCorrelationId).toBe('comment:pull_request_review_comment:99');
    expect(issueComment.requestCorrelationId).not.toBe(reviewComment.requestCorrelationId);
  });

  it('uses each review-comment id instead of collapsing replies into the event fallback', () => {
    const first = projectPublishResultContext(source([], {
      eventName: 'pull_request_review_comment',
      inputs: { action: 'created', pull_request_review_comment: { id: 99 } },
    }));
    const second = projectPublishResultContext(source([], {
      eventName: 'pull_request_review_comment',
      inputs: { action: 'created', pull_request_review_comment: { id: 100 } },
    }));

    expect(first.requestCorrelationId).toBe('comment:pull_request_review_comment:99');
    expect(second.requestCorrelationId).toBe('comment:pull_request_review_comment:100');
    expect(first.requestCorrelationId).not.toBe(second.requestCorrelationId);
  });

  it('keeps legacy issue-comment correlation stable regardless of event metadata', () => {
    const context = projectPublishResultContext(source([], {
      eventName: 'unsafe transport\n<!-- marker -->',
      inputs: { action: 'created', comment: { id: 99 } },
    }));

    expect(context.requestCorrelationId).toBe('comment:99');
  });

  it('does not mutate an unchanged plan card on replay', async () => {
    const comments = inMemoryComments();
    const useCase = new PublishResultUseCase(comments);
    const context = projectPublishResultContext(source([recommendation()]));

    await useCase.invoke(context);
    comments.addComment.mockClear();
    comments.updateComment.mockClear();
    await useCase.invoke(context);

    expect(comments.addComment).not.toHaveBeenCalled();
    expect(comments.updateComment).not.toHaveBeenCalled();
    expect(comments.values).toHaveLength(1);
  });

  it('updates the same plan card after a material recommendation change', async () => {
    const comments = inMemoryComments();
    const useCase = new PublishResultUseCase(comments);

    await useCase.invoke(projectPublishResultContext(source([recommendation()])));
    await useCase.invoke(projectPublishResultContext(source([
      recommendation('1. Replace the policy\n2. Extend integration tests', 'b'.repeat(16)),
    ])));

    expect(comments.addComment).toHaveBeenCalledTimes(1);
    expect(comments.updateComment).toHaveBeenCalledTimes(1);
    expect(comments.values[0].body).toContain('Replace the policy');
  });

  it.each([
    [0, 'not started'],
    [65, 'in progress'],
    [100, 'complete'],
  ] as const)('renders bounded progress state for %s%%', async (value, state) => {
    const comments = inMemoryComments();

    await new PublishResultUseCase(comments).invoke(projectPublishResultContext(source([progress(value)])));

    expect(comments.values[0].body).toContain(`## Progress: ${value}% — ${state}`);
    expect(comments.values[0].body).not.toContain('Reasoning');
  });

  it('uses the configured issue locale for deterministic Spanish copy', async () => {
    const comments = inMemoryComments();

    await new PublishResultUseCase(comments).invoke(projectPublishResultContext(source(
      [progress(100)],
      { locale: { issue: 'es-MX', pullRequest: 'en-US' } },
    )));

    expect(comments.values[0].body).toContain('## Progreso: 100% — completado');
    expect(comments.values[0].body).toContain('No se requiere ninguna acción.');
  });

  it('omits semantic publication when the trusted bot identity is unavailable', async () => {
    const comments = inMemoryComments();

    await new PublishResultUseCase(comments).invoke(projectPublishResultContext(source(
      [recommendation()], { tokenUser: '  ' },
    )));

    expect(comments.listIssueComments).not.toHaveBeenCalled();
    expect(comments.addComment).not.toHaveBeenCalled();
  });

  it('returns a publication-only failure without replaying or mutating result data', async () => {
    const original = recommendation();
    const comments = inMemoryComments();
    comments.listIssueComments.mockRejectedValue(new Error('provider unavailable'));
    const context = projectPublishResultContext(source([original]));
    original.steps[0] = 'mutated after projection';

    const failure = await new PublishResultUseCase(comments).invoke(context);

    expect(context.results[0].steps).toEqual(['legacy plan wrapper that must never be published']);
    expect(failure).toMatchObject({ success: false, executed: true });
    expect(failure?.errors[0]).toMatchObject({ code: 'provider.unavailable' });
  });

  it('projects fallback issue targets and recursively copies array payloads', () => {
    const mutable = [{ nested: ['value'] }];
    const context = projectPublishResultContext(source([
      new Result({ id: 'metadata', success: true, executed: true, payload: mutable }),
    ], { issue: undefined, issueNumber: 42 }));
    mutable[0].nested[0] = 'changed';

    expect(context.target).toEqual({ kind: 'issue', number: 42 });
    expect(context.results[0].payload).toEqual([{ nested: ['value'] }]);
  });
});
