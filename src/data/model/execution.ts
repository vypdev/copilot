
import { Ai } from "./ai";
import { Branches } from "./branches";
import { Commit } from "./commit";
import { Config } from "./config";
import { Emoji } from "./emoji";
import { Hotfix } from "./hotfix";
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
import { githubUsersMatch } from '../../domain/github_user_policy';
import type { ExecutionInputs } from './execution_inputs';
import type { ExecutionComponents } from './execution_components';
import { DEFAULT_INACTIVITY_THRESHOLD_HOURS } from '../../domain/issue_inactivity';
import { DEFAULT_DEPLOYMENT_CONFIGURATION, type DeploymentConfigurationValues } from '../../domain/deployment_configuration';
import { ALL_ISSUE_WORKFLOWS, classifyIssueWorkflow, type IssueWorkflowAdmission, type IssueWorkflowProfile } from '../../domain/issue_workflow_profile';
import type { IssueWorkflowKind } from '../../domain/issue_workflow_profile';
import type { IssueWorkflowRuntimeMode } from '../../domain/issue_workflow_runtime_policy';


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
    emoji: Emoji;
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
    deployment: DeploymentConfigurationValues;
    project: Projects;
    previousConfiguration: Config | undefined;
    currentConfiguration: Config;
    tokenUser: string | undefined;
    inactivityThresholdHours: number;
    inputs: ExecutionInputs | undefined;
    readonly issueWorkflowProfile: IssueWorkflowProfile;
    readonly issueWorkflowProfileLegacy: boolean;
    readonly issueWorkflowProfileDigest?: string;
    currentIssueWorkflowAdmission?: IssueWorkflowAdmission;
    issueWorkflowRuntimeMode: IssueWorkflowRuntimeMode = 'execute';

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
        return this.issue.isIssue
            || (this.issue.isIssueComment && !this.pullRequest.isPullRequestConversationComment)
            || this.singleAction.isIssue;
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
        const admission = this.issueWorkflowAdmission;
        if (admission.status === 'eligible' && admission.kind === 'help') return false;
        if (admission.status !== 'eligible' && this.isIssue) return false;
        return this.issue.branchManagementAlways ||
            this.labels.containsBranchedLabel ||
            this.labels.isMandatoryBranchedLabel;
    }

    get issueWorkflowAdmission(): IssueWorkflowAdmission {
        return this.currentIssueWorkflowAdmission ?? classifyIssueWorkflow(
            this.labels.currentIssueLabels,
            this.issueWorkflowProfile,
            {
                feature: [this.labels.feature, this.labels.enhancement],
                bugfix: [this.labels.bugfix, this.labels.bug],
                documentation: [this.labels.documentation, this.labels.docs],
                chore: [this.labels.chore, this.labels.maintenance],
                help: [this.labels.help, this.labels.question],
                hotfix: [this.labels.hotfix],
                release: [this.labels.release],
            },
            this.issue.body,
            !this.issueWorkflowProfileLegacy,
        );
    }

    get issueWorkflowKind(): IssueWorkflowKind | undefined {
        const admission = this.issueWorkflowAdmission;
        return admission.status === 'eligible' ? admission.kind : undefined;
    }

    get issueNotBranched(): boolean {
        return this.isIssue && !this.isBranched;
    }

    get managementBranch(): string {
        return issueWorkflowBranch(this.issueWorkflowKind, this.branches);
    }

    get issueType(): string {
        return issueWorkflowBranch(this.issueWorkflowKind, this.branches);
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
        return githubUsersMatch(this.tokenUser ?? '', this.actor);
    }

    constructor(components: ExecutionComponents) {
        this.debug = components.debug;
        this.singleAction = components.singleAction;
        this.commitPrefixBuilder = components.commitPrefixBuilder;
        this.issue = components.issue;
        this.pullRequest = components.pullRequest;
        this.tokens = components.tokens;
        this.ai = components.ai;
        this.emoji = components.emoji;
        this.labels = components.labels;
        this.issueTypes = components.issueTypes;
        this.locale = components.locale;
        this.sizeThresholds = components.sizeThresholds;
        this.branches = components.branches;
        this.release = components.release;
        this.hotfix = components.hotfix;
        this.project = components.projects;
        this.workflows = components.workflows;
        this.deployment = components.deployment ?? { ...DEFAULT_DEPLOYMENT_CONFIGURATION };
        this.tokenUser = components.tokenUser;
        this.inactivityThresholdHours = components.inactivityThresholdHours ?? DEFAULT_INACTIVITY_THRESHOLD_HOURS;
        this.currentConfiguration = new Config({});
        this.inputs = components.inputs;
        this.welcome = components.welcome;
        this.issueWorkflowProfile = components.issueWorkflowProfile ?? ALL_ISSUE_WORKFLOWS;
        this.issueWorkflowProfileLegacy = components.issueWorkflowProfileLegacy ?? components.issueWorkflowProfile === undefined;
        this.issueWorkflowProfileDigest = components.issueWorkflowProfileDigest;
        this.currentIssueWorkflowAdmission = components.issueWorkflowAdmission;
        this.currentConfiguration.issueWorkflowProfileDigest = components.issueWorkflowProfileDigest;
    }

}

function issueWorkflowBranch(kind: IssueWorkflowKind | undefined, branches: Branches): string {
    if (!kind || kind === 'help') return '';
    return ({
        feature: branches.featureTree,
        bugfix: branches.bugfixTree,
        documentation: branches.docsTree,
        chore: branches.choreTree,
        hotfix: branches.hotfixTree,
        release: branches.releaseTree,
    })[kind];
}
