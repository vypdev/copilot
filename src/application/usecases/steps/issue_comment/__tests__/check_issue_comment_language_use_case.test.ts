import { CheckIssueCommentLanguageUseCase, projectIssueCommentLanguageRequest } from '../check_issue_comment_language_use_case';
import { CommentLanguageTranslationWorkflow, getCommentLanguageAdaptationPayload } from '../../common/comment_language_translation_workflow';

const query = jest.fn();

function source(overrides: Record<string, unknown> = {}) {
  return {
    isPullRequest: false,
    tokenUser: 'vypbot',
    issue: { number: 1, commentId: 42, commentBody: '@vypbot Hello world' },
    pullRequest: { number: -1 },
    locale: { issue: 'es-ES', pullRequest: 'fr-FR' },
    ai: { getAgentConfiguration: () => ({ provider: 'opencode', model: 'model' }) },
    ...overrides,
  } as never;
}

describe('CheckIssueCommentLanguageUseCase', () => {
  const useCase = new CheckIssueCommentLanguageUseCase(new CommentLanguageTranslationWorkflow({ query }));

  beforeEach(() => query.mockReset());

  it('projects an issue request with its effective locale and trusted bot', () => {
    expect(projectIssueCommentLanguageRequest(source())).toMatchObject({
      commentBody: '@vypbot Hello world', locale: 'es-ES', issueNumber: 1,
      commentId: 42, trustedBotLogin: 'vypbot',
    });
  });

  it('projects PR-conversation comments with the PR locale and number', () => {
    expect(projectIssueCommentLanguageRequest(source({
      isPullRequest: true,
      issue: { number: 9, commentId: 90, commentBody: '@vypbot Review this' },
      pullRequest: { number: 9 },
    }))).toMatchObject({ locale: 'fr-FR', issueNumber: 9, commentId: 90 });
  });

  it('is inert for empty and legacy-translated comments', async () => {
    for (const commentBody of ['', 'Done\n<!-- copilot:translated-comment:v2 -->']) {
      const results = await useCase.invoke(projectIssueCommentLanguageRequest(source({
        issue: { number: 1, commentId: 42, commentBody },
      })));
      expect(results[0]).toMatchObject({ success: true, executed: false });
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('returns one non-mutating language adaptation result', async () => {
    query.mockResolvedValue({
      status: 'translated', sourceLocale: 'en', targetLocale: 'es-ES',
      adaptedText: 'Revisa esto', reasonCode: 'none',
    });
    const results = await useCase.invoke(projectIssueCommentLanguageRequest(source()));

    expect(query).toHaveBeenCalledTimes(1);
    expect(getCommentLanguageAdaptationPayload(results[0])).toMatchObject({
      status: 'translated', targetLocale: 'es-ES',
    });
  });
});
