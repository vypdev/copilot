import { shouldTrackAgentActivity, type AgentActivityExecutionContext } from '../../policies/agent_activity_policy';
import { ALL_ISSUE_WORKFLOWS } from '../../../domain/issue_workflow_profile';
import { parseCopilotCommand } from '../../../domain/copilot_command';
import type { CommentAutomationContext } from '../comment_automation_context';
import type { CommentAutomationOptions } from '../comment_automation_contracts';
import { runCommentAutomation } from '../comment_automation_use_case';
import { selectSemanticReplyIntents, renderSemanticReply } from '../../policies/semantic_result_publication_policy';
import { activeAgentTasks } from '../../policies/agent_task_activation_policy';
import { SingleAction } from '../../../data/model/single_action';
import type { GithubActionEventInputs } from '../../../actions/github_event_inputs';

jest.mock('../../../utils/logger', () => ({ logInfo: jest.fn(), logError: jest.fn(), logDebugInfo: jest.fn() }));
function fixture(body = '/copilot sdd-diff', locale = 'en-US') {
  const request = { target: { kind: 'issue' as const, number: 42 }, repositoryId: 17, issueAuthor: 'author', profile: ALL_ISSUE_WORKFLOWS,
    labelConfiguration: {}, profileDigest: 'a'.repeat(64), trustedBotLogin: 'vypbot', preBranchSdd: true, issueManagedBranches: true };
  const param = { userComment: body, actor: 'visitor', trustedBotLogin: 'vypbot', membersOnly: true,
    language: { locale }, status: { owner: 'acme', repository: 'demo' }, sddDiff: request } as unknown as CommentAutomationContext;
  const unavailable = () => ({ invoke: jest.fn().mockRejectedValue(new Error('MODEL-MUST-NOT-RUN')) });
  const options = { taskId: 'IssueCommentUseCase', languageUseCase: unavailable(), intentUseCase: unavailable(), thinkUseCase: unavailable(),
    autofixUseCase: unavailable(), doUserRequestUseCase: unavailable(), bugbotGitMutationPort: { execute: jest.fn() },
    sddDiffQueryPort: { serverOrigin: 'https://github.example', read: jest.fn().mockResolvedValue({ state: 'initial-only', publication: {
      path: 'specs/feature.md', firstSha: 'b'.repeat(40) } }) } } as unknown as CommentAutomationOptions;
  const authorization = { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(false), isActorAllowedToUseMemberOnlyAutomation: jest.fn().mockResolvedValue(false) };
  return { param, options, authorization };
}

describe('deterministic SDD diff comment interaction', () => {
  it.each(['/copilot sdd-diff', '  /CoPiLoT SDD-DIFF  ', '/copilot\nsdd-diff', '/copilot\t\tsdd-diff'])('accepts the no-argument public command %s', body => {
    expect(parseCopilotCommand(body)).toMatchObject({ kind: 'command', command: { name: 'sdd-diff', arguments: [] } });
  });
  it.each(['/copilot sdd-diff specs/other.md', '/copilot sdd-diff --from master'])('rejects path/ref overrides %s', body => {
    expect(parseCopilotCommand(body).kind).toBe('invalid');
  });
  it.each(['en-US', 'es-ES', 'ja-JP'])('publishes a complete bounded static reply for %s without permission/model calls', async locale => {
    const f = fixture('/copilot sdd-diff', locale);
    const results = await runCommentAutomation(f.param, f.options, f.authorization);
    const intents = selectSemanticReplyIntents({ target: { kind: 'issue', number: 42 }, locale, correlationId: 'comment:77', results });
    expect(intents).toHaveLength(1); expect(intents[0].messageKey).toBe('copilot-sdd-diff');
    expect(intents[0].locale).toBe(locale === 'es-ES' ? 'es-ES' : 'en-US');
    const body = renderSemanticReply(intents[0]);
    expect(body).toContain(locale === 'es-ES' ? 'Primera publicación' : 'First publication');
    expect(body).toContain('https://github.example/acme/demo/blob/'); expect(body.length).toBeLessThanOrEqual(6000);
    expect(f.authorization.isActorAllowedToUseMemberOnlyAutomation).not.toHaveBeenCalled();
    expect(f.authorization.isActorAllowedToModifyFiles).not.toHaveBeenCalled();
    for (const key of ['languageUseCase', 'intentUseCase', 'thinkUseCase', 'autofixUseCase', 'doUserRequestUseCase'] as const) {
      expect(f.options[key].invoke).not.toHaveBeenCalled();
    }
    expect(f.options.bugbotGitMutationPort.execute).not.toHaveBeenCalled();
  });
  it('reports unavailable when composition does not supply the readonly query', async () => {
    const f = fixture(); const results = await runCommentAutomation(f.param, { ...f.options, sddDiffQueryPort: undefined }, f.authorization);
    expect(results[0].payload).toMatchObject({ publication: { kind: 'sdd-diff', markdown: expect.stringContaining('could not be verified') } });
  });
  it('rejects arguments before query, authorization, model or mutation', async () => {
    const f = fixture('/copilot sdd-diff --path secrets'); const results = await runCommentAutomation(f.param, f.options, f.authorization);
    expect(results[0].success).toBe(false); expect(f.options.sddDiffQueryPort!.read).not.toHaveBeenCalled();
    expect(f.authorization.isActorAllowedToModifyFiles).not.toHaveBeenCalled();
  });
  it.each(['issue_comment', 'pull_request_review_comment'])('activates no agent role for the %s event', eventName => {
    const event = { eventName, actor: 'visitor', repo: { owner: 'acme', repo: 'demo' }, comment: { body: '/copilot sdd-diff' } } as GithubActionEventInputs;
    expect(activeAgentTasks(event, new SingleAction('', '', '', '', ''), 'vypbot', true, true)).toEqual([]);
  });
});


describe('SDD diff does not acquire agent activity', () => {
  it.each(['issue-comment', 'pull-request-review-comment'] as const)('omits activity for %s even with configured agents', route => {
    const readAgent = jest.fn(() => ({ model: 'available-model' }));
    const execution = { issueNumber: 7, issue: { number: 7, commentBody: '/copilot sdd-diff' },
      pullRequest: { number: 9, commentBody: '/copilot sdd-diff' }, ai: { getAgentConfiguration: readAgent } } as unknown as AgentActivityExecutionContext;
    expect(shouldTrackAgentActivity(execution, route)).toBe(false);
    expect(readAgent).not.toHaveBeenCalled();
  });
});
