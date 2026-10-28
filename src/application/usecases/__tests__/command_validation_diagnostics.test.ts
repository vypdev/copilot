import { replyRequestBodyDigest } from '../../../domain/reply_request_digest';
import { selectSemanticReplyIntents } from '../../policies/semantic_result_publication_policy';
import { reconcileReply } from '../steps/common/reply_publication_workflow';
import { invalidCommentCommandResult } from '../comment_automation_command_workflow';
import { runCommentAutomation } from '../comment_automation_use_case';
import type { CommentAutomationContext } from '../comment_automation_context';
import type { CommentAutomationOptions } from '../comment_automation_contracts';
import { renderApplicationErrorMarkdown } from '../../policies/application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../../policies/application_error_message_catalog';
import { DEFAULT_BUGBOT_REVIEW_CONFIGURATION } from '../../../domain/bugbot/review_configuration';
import { Result } from '../../../data/model/result';

function harness() {
  const review = { invoke: jest.fn().mockResolvedValue([new Result({ id: 'review', success: true, executed: true })]) };
  const services = Array.from({ length: 5 }, () => ({ invoke: jest.fn().mockResolvedValue([]) }));
  const options = { taskId: 'CommentAutomation', languageUseCase: services[0], intentUseCase: services[1],
    thinkUseCase: services[2], autofixUseCase: services[3], doUserRequestUseCase: services[4],
    reviewPotentialProblemsUseCase: review, syncBranchUseCase: { invoke: jest.fn().mockResolvedValue([]) },
    bugbotGitMutationPort: {} } as unknown as CommentAutomationOptions;
  const authorization = { isActorAllowedToUseMemberOnlyAutomation: jest.fn().mockResolvedValue(true),
    isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) };
  async function run(userComment: string, membersOnly = false) {
    const context = { actor: 'contributor', trustedBotLogin: 'vypbot', userComment, membersOnly,
      think: { request: { kind: 'unavailable' } },
      language: { locale: 'en-US' }, bugbot: { fixIntent: { comment: { body: userComment } }, review: { analysis: {
        reviewConfiguration: DEFAULT_BUGBOT_REVIEW_CONFIGURATION }, locale: { pullRequest: 'en-US' } } } } as unknown as CommentAutomationContext;
    return runCommentAutomation(context, options, authorization);
  }
  return { run, services, review, options, authorization };
}

describe('actionable rejected-command diagnostics (#701)', () => {
  it.each([
    { input: '/copilot recheck ' + Array.from({ length: 21 }, () => 'PRIVATE_OPERAND').join(' '),
      cause: '20', action: '/copilot recheck' },
    { input: '/copilot plan ' + 'PRIVATE_OPERAND'.repeat(150), cause: '2,000', action: '/copilot help' },
    { input: '/copilot dismiss "PRIVATE_OPERAND', cause: 'quoted', action: '/copilot dismiss' },
    { input: '/copilot PRIVATE_OPERAND', cause: 'supported', action: '/copilot help' },
  ])('publishes a safe specific cause and valid recovery for $action', async ({ input, cause, action }) => {
    const h = harness();
    const results = await h.run(input);
    expect(results[0]).toMatchObject({ success: false, executed: false });
    const text = renderApplicationErrorMarkdown(results[0].errors[0], resolveStaticApplicationErrorCatalog('en-US').message);
    expect(text).toContain(cause);
    expect(text).toContain(action);
    expect(text).toContain('https://docs.page/vypdev/copilot/issues/comment-commands');
    expect(JSON.stringify(results)).not.toContain('PRIVATE_OPERAND');
    for (const service of h.services) expect(service.invoke).not.toHaveBeenCalled();
    expect(h.review.invoke).not.toHaveBeenCalled();
    expect(h.authorization.isActorAllowedToModifyFiles).not.toHaveBeenCalled();
  });
});



describe('validation at the actual command boundary', () => {
  it.each([
    ['/copilot', 'comment-command-name-missing'],
    ['/copilot status PRIVATE_OPERAND', 'comment-command-arguments-unexpected'],
    ['/copilot remember', 'comment-command-arguments-missing'],
    ['/copilot review PRIVATE_OPERAND', 'comment-command-review-format'],
    ['/copilot analyze effort=PRIVATE_OPERAND', 'comment-command-review-effort'],
    ['/copilot findings dry-run=PRIVATE_OPERAND', 'comment-command-review-boolean'],
    ['/copilot recheck PRIVATE_OPERAND=true', 'comment-command-review-option'],
    ['/copilot sync-branch --PRIVATE_OPERAND', 'comment-command-sync-option'],
    ['/copilot sync-branch --from=', 'comment-command-sync-parent'],
  ])('rejects %s before any command effect', async (input, reason) => {
    const h = harness();
    const results = await h.run(input);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ success: false, executed: false,
      errors: [{ code: 'validation.invalid-input', recovery: { id: reason } }] });
    expect(JSON.stringify(results)).not.toContain('PRIVATE_OPERAND');
    expect(h.review.invoke).not.toHaveBeenCalled();
    expect(h.options.syncBranchUseCase!.invoke).not.toHaveBeenCalled();
    expect(h.authorization.isActorAllowedToModifyFiles).not.toHaveBeenCalled();
    for (const service of h.services) expect(service.invoke).not.toHaveBeenCalled();
  });

  it('accepts the corrected bare recheck after rejecting the oversized operand list', async () => {
    const h = harness();
    await h.run('/copilot recheck ' + 'explanation '.repeat(21));
    expect(h.review.invoke).not.toHaveBeenCalled();
    const corrected = await h.run('/copilot recheck');
    expect(h.review.invoke).toHaveBeenCalledTimes(1);
    expect(corrected.every(result => result.success)).toBe(true);
    expect(h.services[0].invoke).not.toHaveBeenCalled();
  });

  it('rejects an invalid interpretation returned by a language port before command execution', async () => {
    const h = harness();
    h.services[0].invoke.mockResolvedValue([new Result({ id: 'language', success: true, executed: true,
      payload: { kind: 'comment-language-adaptation', status: 'translated', targetLocale: 'en-US',
        interpretedComment: '/copilot implement ' + 'x'.repeat(2000), reasonCode: 'none' } })]);
    const results = await h.run('/copilot implement describe the change');
    expect(results.at(-1)).toMatchObject({ success: false, executed: false,
      errors: [{ recovery: { id: 'comment-command-length', variables: { command: 'help' } } }] });
    for (const service of h.services.slice(1)) expect(service.invoke).not.toHaveBeenCalled();
    expect(h.authorization.isActorAllowedToModifyFiles).not.toHaveBeenCalled();
  });

  it('preserves member authorization for valid commands', async () => {
    const h = harness();
    h.authorization.isActorAllowedToUseMemberOnlyAutomation.mockResolvedValue(false);
    expect(await h.run('/copilot recheck', true)).toMatchObject([{ success: true, executed: false }]);
    expect(h.review.invoke).not.toHaveBeenCalled();
  });

  it('keeps generic callers compatible without inventing command diagnostics', () => {
    const result = invalidCommentCommandResult('Other', 'Private diagnostic');
    expect(result.errors[0].recovery).toBeUndefined();
    const text = renderApplicationErrorMarkdown(result.errors[0]);
    expect(text).toContain('Correct the input and retry.');
    expect(text).not.toContain('Private diagnostic');
  });

  it('replays a rejected command through the existing one-reply identity', async () => {
    const h = harness();
    const input = '/copilot recheck ' + 'PRIVATE_OPERAND '.repeat(21);
    const first = await h.run(input);
    const second = await h.run(input);
    const intents = [first, second].map(results => selectSemanticReplyIntents({
      results, locale: 'es-ES', target: { kind: 'pull-request', number: 699 }, correlationId: 'comment:42',
    })[0]);
    const comments: { id: number; body: string; user: { login: string } }[] = [];
    const port = {
      listIssueComments: jest.fn(async () => comments),
      addComment: jest.fn(async (_number: number, body: string) => { comments.push({ id: 1, body, user: { login: 'vypbot' } }); }),
      updateComment: jest.fn(async (_number: number, id: number, body: string) => { comments.find(comment => comment.id === id)!.body = body; }),
      removeComment: jest.fn(),
    };
    for (const intent of intents) {
      await reconcileReply({ owner: 'vypdev', repository: 'copilot', botLogin: 'vypbot', intent,
        requestSource: { surface: 'issue-comment', commentId: 42, author: 'contributor', target: intent.target,
          bodyDigest: replyRequestBodyDigest(input) } }, port, { matches: async () => true });
    }
    expect(port.addComment).toHaveBeenCalledTimes(1);
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toContain('20 argumentos');
    expect(comments[0].body).toContain('/copilot recheck');
    expect(comments[0].body).not.toContain('PRIVATE_OPERAND');
    expect(h.review.invoke).not.toHaveBeenCalled();
  });
});
