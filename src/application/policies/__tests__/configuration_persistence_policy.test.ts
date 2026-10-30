import { ACTIONS } from '../../../data/model/action_types';
import { SingleAction } from '../../../data/model/single_action';
import { shouldPersistConfiguration } from '../configuration_persistence_policy';

describe('shouldPersistConfiguration', () => {
    it('persists configuration for regular event executions', () => {
        expect(shouldPersistConfiguration({
            isSingleAction: false,
            singleAction: new SingleAction('', '', '', '', ''),
        } as never)).toBe(true);
    });

    it('persists recommendation state for the recommendation single action', () => {
        expect(shouldPersistConfiguration({
            isSingleAction: true,
            singleAction: new SingleAction(ACTIONS.RECOMMEND_STEPS, '1', '', '', ''),
        } as never)).toBe(true);
    });

    it.each([
        ACTIONS.CREATE_TAG,
        ACTIONS.CREATE_RELEASE,
        ACTIONS.PUBLISH_GITHUB_ACTION,
        ACTIONS.THINK,
        ACTIONS.CHECK_PROGRESS,
        ACTIONS.DETECT_POTENTIAL_PROBLEMS,
        ACTIONS.INITIAL_SETUP,
        ACTIONS.PUBLISH_ISSUE_COMMENT,
        ACTIONS.PREPARE_DEPLOYMENT,
        ACTIONS.CONTINUE_DEPLOYMENT,
        ACTIONS.PUBLISHED_DEPLOYMENT,
        ACTIONS.FAILED_DEPLOYMENT,
    ])('does not persist configuration for the %s single action', (actionName) => {
        expect(shouldPersistConfiguration({
            isSingleAction: true,
            singleAction: new SingleAction(actionName, actionName === ACTIONS.INITIAL_SETUP ? '0' : '1', '', '', ''),
        } as never)).toBe(false);
    });
});


describe('read-only request persistence', () => {
    const base = { isSingleAction: false, singleAction: { isRecommendStepsAction: false } };
    it.each(['issue_comment', 'pull_request_review_comment'])('does not rewrite hidden configuration after a %s status query', eventName => {
        expect(shouldPersistConfiguration({ ...base, eventName, inputs: { comment: { body: '  /CoPiLoT STATUS  ' } } })).toBe(false);
    });
    it('does not rewrite configuration for help on the review transport alias', () => {
        expect(shouldPersistConfiguration({ ...base, eventName: 'pull_request_review_comment', inputs: { pull_request_review_comment: { body: '/copilot help' } } })).toBe(false);
    });
    it.each(['/copilot remember new rule', '/copilot dismiss finding:42', '/copilot status extra', 'ordinary prose', null])('preserves persistence for non-read-only request %#', body => {
        expect(shouldPersistConfiguration({ ...base, eventName: 'issue_comment', inputs: { comment: { body } } })).toBe(true);
    });
});


describe('closed issue retirement persistence', () => {
    it.each(['closed', 'labeled'])('does not rewrite execution configuration on a native closed issue %s callback', action => {
        expect(shouldPersistConfiguration({ isSingleAction: false, eventName: 'issues', inputs: { action, issue: { state: 'closed' } },
            singleAction: { isRecommendStepsAction: false } } as never)).toBe(false);
    });
});


it.each(['open', undefined])('retains normal persistence without native closed evidence (%s)', state => {
    expect(shouldPersistConfiguration({ isSingleAction: false, eventName: 'issues', inputs: { issue: { state } },
        singleAction: { isRecommendStepsAction: false } })).toBe(true);
});


it('skips stale or retained-link PR completion state before the configuration writer', () => {
  for (const error of [{ code: 'workflow.stale' }, { code: 'provider.unavailable', recovery: { id: 'pull-request-link-base-and-reference-retained' } }]) {
    expect(shouldPersistConfiguration({ isPullRequest: true, isSingleAction: false,
      singleAction: { isRecommendStepsAction: false }, currentConfiguration: { results: [{ errors: [error] }] } })).toBe(false);
  }
});
it('retains ordinary issue persistence and verified current PR completion', () => {
  const normal = { isSingleAction: false, singleAction: { isRecommendStepsAction: false } };
  expect(shouldPersistConfiguration({ ...normal, isPullRequest: true, currentConfiguration: { results: [{ errors: [] }] } })).toBe(true);
  expect(shouldPersistConfiguration({ ...normal, isPullRequest: false,
    currentConfiguration: { results: [{ errors: [{ code: 'workflow.stale' }] }] } })).toBe(true);
});
