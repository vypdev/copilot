import { ACTIONS } from './action_types';
import { parsePositiveSafeInteger } from '../../domain/positive_integer_policy';

export class SingleAction {
    currentSingleAction: string;
    actions: string[] = [
        ACTIONS.PUBLISH_GITHUB_ACTION,
        ACTIONS.CREATE_TAG,
        ACTIONS.CREATE_RELEASE,
        ACTIONS.THINK,
        ACTIONS.INITIAL_SETUP,
        ACTIONS.CHECK_PROGRESS,
        ACTIONS.DETECT_POTENTIAL_PROBLEMS,
        ACTIONS.RECOMMEND_STEPS,
        ACTIONS.CLOSE_INACTIVE_ISSUES,
        ACTIONS.PUBLISH_ISSUE_COMMENT,
        ACTIONS.CHECK_BRANCH_SYNC,
        ACTIONS.PREPARE_DEPLOYMENT,
        ACTIONS.CONTINUE_DEPLOYMENT,
        ACTIONS.PUBLISHED_DEPLOYMENT,
        ACTIONS.FAILED_DEPLOYMENT,
    ];
    /**
     * Actions that throw an error if the last step failed
     */
    actionsThrowError: string[] = [
       ACTIONS.PUBLISH_GITHUB_ACTION,
       ACTIONS.CREATE_RELEASE,
       ACTIONS.CREATE_TAG,
       ACTIONS.CLOSE_INACTIVE_ISSUES,
       ACTIONS.PUBLISH_ISSUE_COMMENT,
       ACTIONS.PREPARE_DEPLOYMENT,
       ACTIONS.CONTINUE_DEPLOYMENT,
       ACTIONS.PUBLISHED_DEPLOYMENT,
       ACTIONS.FAILED_DEPLOYMENT,
    ];

    /**
     * Actions that do not require an issue
     */
    actionsWithoutIssue: string[] = [
        ACTIONS.THINK,
        ACTIONS.INITIAL_SETUP,
        ACTIONS.CLOSE_INACTIVE_ISSUES,
        ACTIONS.CHECK_BRANCH_SYNC,
    ];

    isIssue: boolean = false;
    isPullRequest: boolean = false;
    isPush: boolean = false;

    /**
     * Properties
     */
    issue: number = -1;
    version: string = '';
    title: string = '';
    changelog: string = '';
    message: string = '';
    operationId: string = '';
    commentId: number = -1;
    commentIdInput: string = '';
    commentMode: string = '';

    get isPublishGithubAction(): boolean {
        return this.currentSingleAction === ACTIONS.PUBLISH_GITHUB_ACTION;
    }

    get isCreateReleaseAction(): boolean {
        return this.currentSingleAction === ACTIONS.CREATE_RELEASE;
    }

    get isCreateTagAction(): boolean {
        return this.currentSingleAction === ACTIONS.CREATE_TAG;
    }

    get isThinkAction(): boolean {
        return this.currentSingleAction === ACTIONS.THINK;
    }

    get isInitialSetupAction(): boolean {
        return this.currentSingleAction === ACTIONS.INITIAL_SETUP;
    }

    get isCheckProgressAction(): boolean {
        return this.currentSingleAction === ACTIONS.CHECK_PROGRESS;
    }

    get isDetectPotentialProblemsAction(): boolean {
        return this.currentSingleAction === ACTIONS.DETECT_POTENTIAL_PROBLEMS;
    }

    get isRecommendStepsAction(): boolean {
        return this.currentSingleAction === ACTIONS.RECOMMEND_STEPS;
    }

    get isCloseInactiveIssuesAction(): boolean {
        return this.currentSingleAction === ACTIONS.CLOSE_INACTIVE_ISSUES;
    }

    get isPublishIssueCommentAction(): boolean {
        return this.currentSingleAction === ACTIONS.PUBLISH_ISSUE_COMMENT;
    }

    get isCheckBranchSyncAction(): boolean {
        return this.currentSingleAction === ACTIONS.CHECK_BRANCH_SYNC;
    }

    get isPrepareDeploymentAction(): boolean {
        return this.currentSingleAction === ACTIONS.PREPARE_DEPLOYMENT;
    }

    get isContinueDeploymentAction(): boolean {
        return this.currentSingleAction === ACTIONS.CONTINUE_DEPLOYMENT;
    }

    get isPublishedDeploymentAction(): boolean {
        return this.currentSingleAction === ACTIONS.PUBLISHED_DEPLOYMENT;
    }

    get isFailedDeploymentAction(): boolean {
        return this.currentSingleAction === ACTIONS.FAILED_DEPLOYMENT;
    }

    get isDeploymentOrchestrationAction(): boolean {
        return this.isPrepareDeploymentAction
            || this.isContinueDeploymentAction
            || this.isPublishedDeploymentAction
            || this.isFailedDeploymentAction;
    }

    get enabledSingleAction(): boolean {
        return this.currentSingleAction.length > 0;
    }

    get validSingleAction(): boolean {
        return this.enabledSingleAction &&
            (this.issue > 0 || this.isSingleActionWithoutIssue) &&
            this.actions.indexOf(this.currentSingleAction) > -1;
    }

    get isSingleActionWithoutIssue(): boolean {
        return this.actionsWithoutIssue.indexOf(this.currentSingleAction) > -1;
    }

    get throwError(): boolean {
        return this.actionsThrowError.indexOf(this.currentSingleAction) > -1;
    }

    constructor(
        currentSingleAction: string,
        issue: string,
        version: string,
        title: string,
        changelog: string,
        message: string = '',
        commentId: string = '',
        commentMode: string = '',
        operationId: string = '',
    ) {
        this.version = version;
        this.title = title;
        this.changelog = changelog;
        this.message = message;
        this.commentIdInput = commentId.trim();
        this.commentId = parsePositiveSafeInteger(this.commentIdInput) ?? -1;
        this.commentMode = commentMode.trim().toLowerCase();
        this.operationId = operationId.trim();
        this.currentSingleAction = currentSingleAction;
        if (!this.isSingleActionWithoutIssue) {
            this.issue = parsePositiveSafeInteger(issue) ?? -1;
        } else {
            this.issue = 0;
        }
    }
}
