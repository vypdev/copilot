import { ACTIONS } from './action_types';

export class SingleAction {
    currentSingleAction: string;
    actions: string[] = [
        ACTIONS.DEPLOYED,
        ACTIONS.PUBLISH_GITHUB_ACTION,
        ACTIONS.CREATE_TAG,
        ACTIONS.CREATE_RELEASE,
        ACTIONS.THINK,
        ACTIONS.INITIAL_SETUP,
        ACTIONS.CHECK_PROGRESS,
        ACTIONS.DETECT_POTENTIAL_PROBLEMS,
        ACTIONS.RECOMMEND_STEPS,
    ];
    /**
     * Actions that throw an error if the last step failed
     */
    actionsThrowError: string[] = [
       ACTIONS.PUBLISH_GITHUB_ACTION,
       ACTIONS.CREATE_RELEASE,
       ACTIONS.DEPLOYED,
       ACTIONS.CREATE_TAG,
    ];

    /**
     * Actions that do not require an issue
     */
    actionsWithoutIssue: string[] = [
        ACTIONS.THINK,
        ACTIONS.INITIAL_SETUP,
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

    get isDeployedAction(): boolean {
        return this.currentSingleAction === ACTIONS.DEPLOYED;
    }

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
    ) {
        this.version = version;
        this.title = title;
        this.changelog = changelog;
        this.currentSingleAction = currentSingleAction;
        if (!this.isSingleActionWithoutIssue) {
            const parsedIssue = Number.parseInt(issue, 10);
            this.issue = Number.isNaN(parsedIssue) ? -1 : parsedIssue;
        } else {
            this.issue = 0;
        }
    }
}
