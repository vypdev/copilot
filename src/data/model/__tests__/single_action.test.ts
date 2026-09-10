import { ACTIONS } from '../action_types';
import { SingleAction } from '../single_action';

describe('SingleAction', () => {
  describe('action type getters', () => {
    it('isPublishGithubAction', () => {
      const s = new SingleAction(ACTIONS.PUBLISH_GITHUB_ACTION, '1', '', '', '');
      expect(s.isPublishGithubAction).toBe(true);
    });

    it('isCreateReleaseAction', () => {
      const s = new SingleAction(ACTIONS.CREATE_RELEASE, '1', '', '', '');
      expect(s.isCreateReleaseAction).toBe(true);
    });

    it('isCreateTagAction', () => {
      const s = new SingleAction(ACTIONS.CREATE_TAG, '1', '', '', '');
      expect(s.isCreateTagAction).toBe(true);
    });

    it('isThinkAction', () => {
      const s = new SingleAction(ACTIONS.THINK, '0', '', '', '');
      expect(s.isThinkAction).toBe(true);
    });

    it('isInitialSetupAction', () => {
      const s = new SingleAction(ACTIONS.INITIAL_SETUP, '0', '', '', '');
      expect(s.isInitialSetupAction).toBe(true);
    });

    it('isCheckProgressAction', () => {
      const s = new SingleAction(ACTIONS.CHECK_PROGRESS, '5', '', '', '');
      expect(s.isCheckProgressAction).toBe(true);
    });

    it('isDetectPotentialProblemsAction', () => {
      const s = new SingleAction(ACTIONS.DETECT_POTENTIAL_PROBLEMS, '5', '', '', '');
      expect(s.isDetectPotentialProblemsAction).toBe(true);
    });

    it('isRecommendStepsAction', () => {
        const s = new SingleAction(ACTIONS.RECOMMEND_STEPS, '5', '', '', '');
        expect(s.isRecommendStepsAction).toBe(true);
    });

    it('isCloseInactiveIssuesAction', () => {
        const s = new SingleAction(ACTIONS.CLOSE_INACTIVE_ISSUES, '0', '', '', '');
        expect(s.isCloseInactiveIssuesAction).toBe(true);
        expect(s.validSingleAction).toBe(true);
        expect(s.isSingleActionWithoutIssue).toBe(true);
    });

    it('isCheckBranchSyncAction', () => {
      const s = new SingleAction(ACTIONS.CHECK_BRANCH_SYNC, '', '', '', '');
      expect(s.isCheckBranchSyncAction).toBe(true);
      expect(s.validSingleAction).toBe(true);
      expect(s.isSingleActionWithoutIssue).toBe(true);
    });

    it('isPublishIssueCommentAction', () => {
      const s = new SingleAction(
        ACTIONS.PUBLISH_ISSUE_COMMENT,
        '42',
        '',
        '',
        '',
        'Deployment failed.',
        '101',
        'APPEND',
      );
      expect(s.isPublishIssueCommentAction).toBe(true);
      expect(s.validSingleAction).toBe(true);
      expect(s.message).toBe('Deployment failed.');
      expect(s.commentId).toBe(101);
      expect(s.commentIdInput).toBe('101');
      expect(s.commentMode).toBe('append');
    });

    it('recognizes a failed deployment continuation and preserves its operation identity', () => {
      const s = new SingleAction(ACTIONS.FAILED_DEPLOYMENT, '42', '3.4.0', '', '', 'failed', '', '', 'operation-12345678');
      expect(s.isFailedDeploymentAction).toBe(true);
      expect(s.isDeploymentOrchestrationAction).toBe(true);
      expect(s.operationId).toBe('operation-12345678');
      expect(s.throwError).toBe(true);
    });
  });

  describe('enabledSingleAction and validSingleAction', () => {
    it('enabledSingleAction is false when currentSingleAction is empty', () => {
      const s = new SingleAction('', '1', '', '', '');
      expect(s.enabledSingleAction).toBe(false);
    });

    it('validSingleAction requires issue > 0 for actions that need issue', () => {
      const s = new SingleAction(ACTIONS.CHECK_PROGRESS, '0', '', '', '');
      s.currentSingleAction = ACTIONS.CHECK_PROGRESS;
      expect(s.validSingleAction).toBe(false);
    });

    it('validSingleAction is true when issue > 0 and action in list', () => {
      const s = new SingleAction(ACTIONS.CHECK_PROGRESS, '10', '', '', '');
      expect(s.validSingleAction).toBe(true);
    });

    it('isSingleActionWithoutIssue for THINK and INITIAL_SETUP', () => {
      const s = new SingleAction(ACTIONS.THINK, '0', '', '', '');
      expect(s.isSingleActionWithoutIssue).toBe(true);
      expect(s.issue).toBe(0);
    });
  });

  describe('throwError', () => {
    it('returns true for actions in actionsThrowError', () => {
      const s = new SingleAction(ACTIONS.CREATE_RELEASE, '1', '', '', '');
      expect(s.throwError).toBe(true);
    });

    it('returns true for publish_issue_comment', () => {
      const s = new SingleAction(ACTIONS.PUBLISH_ISSUE_COMMENT, '1', '', '', '');
      expect(s.throwError).toBe(true);
    });

    it('returns false for think_action', () => {
      const s = new SingleAction(ACTIONS.THINK, '0', '', '', '');
      expect(s.throwError).toBe(false);
    });
  });

  describe('constructor parses issue number', () => {
    it('sets issue to 0 for actions without issue', () => {
      const s = new SingleAction(ACTIONS.THINK, '0', '', '', '');
      expect(s.issue).toBe(0);
    });

    it('ignores a non-numeric issue for THINK', () => {
      const s = new SingleAction(ACTIONS.THINK, 'not-a-number', '', '', '');
      expect(s.issue).toBe(0);
    });

    it('ignores the provided issue for INITIAL_SETUP', () => {
      const s = new SingleAction(ACTIONS.INITIAL_SETUP, '999', '', '', '');
      expect(s.issue).toBe(0);
    });

    it('sets issue from numeric string for actions that require issue', () => {
      const s = new SingleAction(ACTIONS.CHECK_PROGRESS, '42', '', '', '');
      expect(s.issue).toBe(42);
    });

    it('normalizes an invalid issue to the domain sentinel', () => {
      const s = new SingleAction(ACTIONS.CHECK_PROGRESS, 'not-a-number', '', '', '');
      expect(s.issue).toBe(-1);
      expect(s.validSingleAction).toBe(false);
    });

    it('rejects partially numeric and unsafe issue values', () => {
      expect(new SingleAction(ACTIONS.CHECK_PROGRESS, '42abc', '', '', '').issue).toBe(-1);
      expect(new SingleAction(ACTIONS.CHECK_PROGRESS, '9007199254740992', '', '', '').issue).toBe(-1);
    });
  });
});
