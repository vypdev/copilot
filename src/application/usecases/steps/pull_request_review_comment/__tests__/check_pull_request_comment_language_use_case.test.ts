import { CheckPullRequestCommentLanguageUseCase, projectPullRequestCommentLanguageRequest } from '../check_pull_request_comment_language_use_case';
import { CommentLanguageTranslationWorkflow, getCommentLanguageAdaptationPayload } from '../../common/comment_language_translation_workflow';

const query = jest.fn();

function source(commentBody = '@vypbot Hello') {
  return {
    tokenUser: 'vypbot',
    pullRequest: { number: 5, commentId: 10, commentBody },
    locale: { pullRequest: 'es-ES' },
    ai: { getAgentConfiguration: () => ({ provider: 'opencode', model: 'model' }) },
  } as never;
}

describe('CheckPullRequestCommentLanguageUseCase', () => {
  const useCase = new CheckPullRequestCommentLanguageUseCase(new CommentLanguageTranslationWorkflow({ query }));

  beforeEach(() => query.mockReset());

  it('projects the PR target, locale, and trusted bot', () => {
    expect(projectPullRequestCommentLanguageRequest(source())).toMatchObject({
      commentBody: '@vypbot Hello', locale: 'es-ES', issueNumber: 5,
      commentId: 10, trustedBotLogin: 'vypbot',
    });
  });

  it('is inert for empty and legacy-translated comments', async () => {
    for (const body of ['', 'Done\n<!-- copilot:translated-comment:v2 -->']) {
      const results = await useCase.invoke(projectPullRequestCommentLanguageRequest(source(body)));
      expect(results[0]).toMatchObject({ success: true, executed: false });
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('returns one non-mutating language adaptation result', async () => {
    query.mockResolvedValue({
      status: 'translated', sourceLocale: 'en', targetLocale: 'es-ES',
      adaptedText: 'Revisa esto', reason: null,
    });
    const results = await useCase.invoke(projectPullRequestCommentLanguageRequest(source()));

    expect(query).toHaveBeenCalledTimes(1);
    expect(getCommentLanguageAdaptationPayload(results[0])).toMatchObject({
      status: 'translated', targetLocale: 'es-ES',
    });
  });
});
