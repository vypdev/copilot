import { Result } from '../../../../../data/model/result';
import { PublishResultUseCase } from '../publish_resume_use_case';
import { projectPublishResultContext, type PublishResultContextSource } from '../publish_resume_workflow';
import type { IssueCommentPublicationTarget } from '../../../../ports/issue_lifecycle_ports';
import type { MessageCatalogResolutionPort } from '../../../../ports/message_catalog_ports';
import { ApplicationError } from '../../../../errors/application_error';

const SOURCE_HEAD = 'a'.repeat(40);
const NEWER_HEAD = 'b'.repeat(40);

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
    payload: {
      issueNumber: 42, progress: value, summary, remaining,
      branch: 'feature/work', developmentBranch: 'develop', sourceHeadSha: SOURCE_HEAD,
    },
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
    removeComment: jest.fn(async (_issueNumber: number, id: number): Promise<'removed' | 'compaction-required'> => {
      const index = values.findIndex(candidate => candidate.id === id);
      if (index >= 0) values.splice(index, 1);
      return 'removed';
    }),
    listIssueComments: jest.fn(async () => values.map(comment => ({ ...comment }))),
  };
}

function publicationSource(...heads: string[]) {
  const remaining = [...heads];
  return { getBranchHeadSha: jest.fn(async () => remaining.shift() ?? SOURCE_HEAD) };
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

  it('publishes an explicit semantic failure once and keeps background failures in operator evidence', async () => {
    const explicitComments = inMemoryComments();
    const backgroundComments = inMemoryComments();
    const failure = new Result({
      id: 'Comment.Command', success: false, executed: false,
      errors: [new ApplicationError('validation.invalid-input', 'Unsafe parser detail.')],
    });
    const explicit = projectPublishResultContext(source([failure], {
      eventName: 'issue_comment', inputs: { action: 'created', comment: { id: 101 } },
    }));

    await new PublishResultUseCase(explicitComments).invoke(explicit);
    await new PublishResultUseCase(explicitComments).invoke(explicit);
    await new PublishResultUseCase(backgroundComments).invoke(projectPublishResultContext(source([failure])));

    expect(explicitComments.addComment).toHaveBeenCalledTimes(1);
    expect(explicitComments.values[0].body).toContain('key="application-error"');
    expect(explicitComments.values[0].body).toContain('## Request could not be completed');
    expect(explicitComments.values[0].body).toContain('`validation.invalid-input`');
    expect(explicitComments.values[0].body).not.toContain('Unsafe parser detail.');
    expect(backgroundComments.listIssueComments).not.toHaveBeenCalled();
    expect(backgroundComments.addComment).not.toHaveBeenCalled();
  });

  it('renders translation failure replies wholly in English even for a configured non-English surface', async () => {
    const comments = inMemoryComments();
    const failure = new Result({
      id: 'Comment.Language', success: false, executed: true,
      errors: [new ApplicationError('locale.translation-failed', 'Provider detail.')],
    });

    await new PublishResultUseCase(comments).invoke(projectPublishResultContext(source([failure], {
      eventName: 'issue_comment', inputs: { action: 'created', comment: { id: 102 } },
      locale: { issue: 'es-ES', pullRequest: 'es-ES' },
    })));

    expect(comments.values[0].body).toContain('## Request could not be completed');
    expect(comments.values[0].body).toContain('**Impact:** The request could not be safely interpreted');
    expect(comments.values[0].body).not.toContain('No se pudo completar');
  });

  it('recognizes the transient namespaced issue-comment marker without creating a duplicate', async () => {
    const comments = inMemoryComments([{
      id: 7,
      user: { login: 'vypbot' },
      body: '<!-- copilot:reply schema="1" target="issue:42" correlation="comment:issue_comment:99" key="copilot-help" digest="0123abcd" -->\n\nExisting response.',
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

  it('returns bounded operator evidence when duplicate deletion is forbidden', async () => {
    const comments = inMemoryComments();
    const useCase = new PublishResultUseCase(comments);
    const value = projectPublishResultContext(source([recommendation()]));
    await useCase.invoke(value);
    comments.values.push({ id: 2, body: comments.values[0].body, user: { login: 'vypbot' } });
    comments.removeComment.mockResolvedValue('compaction-required');

    const outcome = await useCase.invoke(value);

    expect(outcome).toMatchObject({
      success: true,
      executed: true,
      payload: { publicationCleanup: {
        reason: 'duplicate-deletion-forbidden', compactedCount: 1, compactedCommentIds: [2],
      } },
    });
    expect(comments.values.find(comment => comment.id === 2)?.body)
      .toContain('copilot:publication-duplicate');
  });

  it.each([
    [0, 'not started'],
    [65, 'in progress'],
    [100, 'complete'],
  ] as const)('renders bounded progress state for %s%%', async (value, state) => {
    const comments = inMemoryComments();

    await new PublishResultUseCase(comments, undefined, publicationSource())
      .invoke(projectPublishResultContext(source([progress(value)])));

    expect(comments.values[0].body).toContain(`## Progress: ${value}% — ${state}`);
    expect(comments.values[0].body).not.toContain('Reasoning');
  });

  it('uses the configured issue locale for deterministic Spanish copy', async () => {
    const comments = inMemoryComments();

    await new PublishResultUseCase(comments, undefined, publicationSource()).invoke(projectPublishResultContext(source(
      [progress(100)],
      { locale: { issue: 'es-MX', pullRequest: 'en-US' } },
    )));

    expect(comments.values[0].body).toContain('## Progreso: 100% — completado');
    expect(comments.values[0].body).toContain('No se requiere ninguna acción.');
  });

  it('renders one atomic dynamically localized plan for any configured BCP-47 locale', async () => {
    const comments = inMemoryComments();
    const resolve = jest.fn(async (request: { sourceCatalog: { messages: Record<string, string> } }) => ({
      requestedLocale: 'fr-FR',
      resolvedLocale: 'fr-FR',
      source: 'dynamic' as const,
      messages: Object.freeze({
        ...request.sourceCatalog.messages,
        'publication.implementationPlan': 'Plan de mise en œuvre',
        'publication.planReady': 'Prêt à commencer. Aucune action de maintenance n’est requise.',
        'publication.planAcceptance': 'Acceptation',
        'publication.commandsHint': 'Besoin d’autre chose ? Utilisez {helpCommand}.',
        'publication.currentStatus': 'État actuel',
        'publication.noActionRequired': 'Aucune action requise.',
      }),
    }));
    const context = projectPublishResultContext(source([recommendation()], {
      locale: { issue: 'fr-FR', pullRequest: 'fr-FR' },
      ai: { getAgentConfiguration: () => ({ provider: 'codex', model: 'model' }) },
    }));

    await new PublishResultUseCase(comments, { resolve } as unknown as MessageCatalogResolutionPort).invoke(context);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(comments.values[0].body).toContain('## Plan de mise en œuvre');
    expect(comments.values[0].body).toContain('**Acceptation:** Aucune action requise.');
    expect(comments.values[0].body).not.toContain('## Implementation plan');
    expect(context.languageConfiguration).toEqual({ provider: 'codex', model: 'model' });
    expect(Object.isFrozen(context.languageConfiguration)).toBe(true);
  });

  it('localizes help prose dynamically while preserving every command token', async () => {
    const comments = inMemoryComments();
    const result = new Result({
      id: 'Comment.Help', success: true, executed: true,
      payload: { publication: { kind: 'help', botLogin: 'vypbot' } },
    });
    const resolve = jest.fn(async (request: { sourceCatalog: { messages: Record<string, string> } }) => ({
      requestedLocale: 'fr-FR', resolvedLocale: 'fr-FR', source: 'dynamic' as const,
      messages: Object.freeze(Object.fromEntries(
        Object.entries(request.sourceCatalog.messages).map(([id, message]) => [id, `FR ${message}`]),
      )),
    }));
    const context = projectPublishResultContext(source([result], {
      eventName: 'issue_comment', inputs: { action: 'created', comment: { id: 105 } },
      locale: { issue: 'fr-FR', pullRequest: 'fr-FR' },
      ai: { getAgentConfiguration: () => ({ provider: 'codex', model: 'model' }) },
    }));

    await new PublishResultUseCase(comments, { resolve } as unknown as MessageCatalogResolutionPort).invoke(context);

    expect(comments.values[0].body).toContain('## FR Copilot commands');
    expect(comments.values[0].body).toContain('`/copilot implement <request>`');
    expect(comments.values[0].body).toContain('`/copilot sync-branch [--dry-run] [--no-agent] [--from <branch>]`');
    expect(comments.values[0].body).not.toContain('## Copilot commands');
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

  it('reports a stale progress publication without changing the issue conversation', async () => {
    const comments = inMemoryComments();
    const sourceQuery = publicationSource(NEWER_HEAD);

    const outcome = await new PublishResultUseCase(comments, undefined, sourceQuery)
      .invoke(projectPublishResultContext(source([progress()])));

    expect(outcome).toMatchObject({
      success: true,
      executed: false,
      payload: { publicationOutcome: { reason: 'stale-source', branch: 'feature/work', sourceHeadSha: SOURCE_HEAD } },
    });
    expect(sourceQuery.getBranchHeadSha).toHaveBeenCalledWith('feature/work');
    expect(comments.listIssueComments).not.toHaveBeenCalled();
    expect(comments.addComment).not.toHaveBeenCalled();
  });

  it('fails closed when progress publication has no authoritative source query', async () => {
    const comments = inMemoryComments();

    const failure = await new PublishResultUseCase(comments)
      .invoke(projectPublishResultContext(source([progress()])));

    expect(failure).toMatchObject({ success: false, executed: true });
    expect(failure?.errors[0]).toMatchObject({ code: 'configuration.unsupported' });
    expect(comments.listIssueComments).not.toHaveBeenCalled();
    expect(comments.addComment).not.toHaveBeenCalled();
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
