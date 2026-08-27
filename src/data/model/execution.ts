
import { branchesForManagement, typesForIssue } from "../../utils/label_utils";
import { Ai } from "./ai";
import { Branches } from "./branches";
import { Commit } from "./commit";
import { Config } from "./config";
import { Emoji } from "./emoji";
import { Hotfix } from "./hotfix";
import { Images } from "./images";
import { Issue } from "./issue";
import { IssueTypes } from "./issue_types";
import { Labels } from "./labels";
import { Locale } from "./locale";
import { Projects } from "./projects";
import { PullRequest } from "./pull_request";
import { Release } from "./release";
import { SingleAction } from "./single_action";
import { SizeThresholds } from "./size_thresholds";
import { Tokens } from "./tokens";
import { Welcome } from "./welcome";
import { Workflows } from "./workflows";


export class Execution {
    debug: boolean = false;
    welcome: Welcome | undefined;
    /**
     * Every usage of this field should be checked.
     * PRs with no issue ID in the head branch won't have it.
     *
     * master <- develop
     */
    issueNumber: number = -1
    singleAction: SingleAction;
    commitPrefixBuilder: string;
    commitPrefixBuilderParams: Record<string, unknown> = {};
    emoji: Emoji;
    images: Images;
    tokens: Tokens;
    ai: Ai;
    labels: Labels;
    issueTypes: IssueTypes;
    locale: Locale;
    sizeThresholds: SizeThresholds;
    branches: Branches;
    release: Release;
    hotfix: Hotfix;
    issue: Issue;
    pullRequest: PullRequest;
    workflows: Workflows;
    project: Projects;
    previousConfiguration: Config | undefined;
    currentConfiguration: Config;
    tokenUser: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GitHub context payload shape is dynamic
    inputs: any | undefined;

    get eventName(): string {
        return this.inputs?.eventName ?? '';
    }

    get actor(): string {
        return this.inputs?.actor ?? '';
    }

    get isSingleAction(): boolean {
        return this.singleAction.enabledSingleAction;
    }

    get isIssue(): boolean {
        return this.issue.isIssue || this.issue.isIssueComment || this.singleAction.isIssue;
    }

    get isPullRequest(): boolean {
        return this.pullRequest.isPullRequest || this.pullRequest.isPullRequestReviewComment || this.singleAction.isPullRequest;
    }

    get isPush(): boolean {
        return this.eventName === 'push';
    }

    get repo(): string {
        return this.inputs?.repo?.repo ?? '';
    }

    get owner(): string {
        return this.inputs?.repo?.owner ?? '';
    }

    get isFeature(): boolean {
        return this.issueType === this.branches.featureTree;
    }

    get isBugfix(): boolean {
        return this.issueType === this.branches.bugfixTree;
    }

    get isDocs(): boolean {
        return this.issueType === this.branches.docsTree;
    }

    get isChore(): boolean {
        return this.issueType === this.branches.choreTree;
    }

    get isBranched(): boolean {
        return this.issue.branchManagementAlways ||
            this.labels.containsBranchedLabel ||
            this.labels.isMandatoryBranchedLabel;
    }

    get issueNotBranched(): boolean {
        return this.isIssue && !this.isBranched;
    }

    get managementBranch(): string {
        return branchesForManagement(
            this,
            this.labels.currentIssueLabels,
            this.labels.feature,
            this.labels.enhancement,
            this.labels.bugfix,
            this.labels.bug,
            this.labels.hotfix,
            this.labels.release,
            this.labels.docs,
            this.labels.documentation,
            this.labels.chore,
            this.labels.maintenance,
        );
    }

    get issueType(): string {
        return typesForIssue(
            this,
            this.labels.currentIssueLabels,
            this.labels.feature,
            this.labels.enhancement,
            this.labels.bugfix,
            this.labels.bug,
            this.labels.hotfix,
            this.labels.release,
            this.labels.docs,
            this.labels.documentation,
            this.labels.chore,
            this.labels.maintenance,
        );
    }

    get cleanIssueBranches(): boolean {
        return this.isIssue
            && this.previousConfiguration !== undefined
            && this.previousConfiguration?.branchType != this.currentConfiguration.branchType;
    }

    get commit(): Commit {
        return new Commit(this.inputs);
    }

    get runnedByToken(): boolean {
        return this.tokenUser === this.actor;
    }

    constructor(
        debug: boolean,
        singleAction: SingleAction,
        commitPrefixBuilder: string,
        issue: Issue,
        pullRequest: PullRequest,
        emoji: Emoji,
        giphy: Images,
        tokens: Tokens,
        ai: Ai,
        labels: Labels,
        issueTypes: IssueTypes,
        locale: Locale,
        sizeThresholds: SizeThresholds,
        branches: Branches,
        release: Release,
        hotfix: Hotfix,
        workflows: Workflows,
        project: Projects,
        welcome: Welcome | undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GitHub context payload
        inputs: any | undefined
    ) {
        this.debug = debug;
        this.singleAction = singleAction;
        this.commitPrefixBuilder = commitPrefixBuilder;
        this.issue = issue;
        this.pullRequest = pullRequest;
        this.images = giphy;
        this.tokens = tokens;
        this.ai = ai;
        this.emoji = emoji;
        this.labels = labels;
        this.issueTypes = issueTypes;
        this.locale = locale;
        this.sizeThresholds = sizeThresholds;
        this.branches = branches;
        this.release = release;
        this.hotfix = hotfix;
        this.project = project;
        this.workflows = workflows;
        this.currentConfiguration = new Config({});
        this.inputs = inputs;
        this.welcome = welcome;
    }

}