import {
    DEFAULT_COPILOT_LIFECYCLE_LABELS,
    type CopilotLifecycleLabels,
} from '../../domain/copilot_lifecycle';

export class Labels {
    branchManagementLauncherLabel: string;

    bug: string;
    bugfix: string;
    hotfix: string;
    enhancement: string;
    feature: string;
    release: string;
    question: string;
    help: string;
    deploy: string;
    deployed: string;
    docs: string;
    documentation: string;
    chore: string;
    maintenance: string;

    sizeXxl: string;
    sizeXl: string;
    sizeL: string;
    sizeM: string;
    sizeS: string;
    sizeXs: string;

    priorityHigh: string;
    priorityMedium: string;
    priorityLow: string;
    priorityNone: string;

    readonly lifecycle: CopilotLifecycleLabels;
    
    currentIssueLabels: string[] = [];
    currentPullRequestLabels: string[] = [];

    get isMandatoryBranchedLabel(): boolean {
        return this.isHotfix || this.isRelease;
    }

    get containsBranchedLabel(): boolean {
        return this.currentIssueLabels.includes(this.branchManagementLauncherLabel);
    }

    get isDeploy(): boolean {
        return this.currentIssueLabels.includes(this.deploy);
    }

    get isDeployed(): boolean {
        return this.currentIssueLabels.includes(this.deployed);
    }

    get isHelp(): boolean {
        return this.currentIssueLabels.includes(this.help);
    }

    get isQuestion(): boolean {
        return this.currentIssueLabels.includes(this.question);
    }

    get isFeature(): boolean {
        return this.currentIssueLabels.includes(this.feature);
    }

    get isEnhancement(): boolean {
        return this.currentIssueLabels.includes(this.enhancement);
    }

    get isBugfix(): boolean {
        return this.currentIssueLabels.includes(this.bugfix);
    }

    get isBug(): boolean {
        return this.currentIssueLabels.includes(this.bug);
    }

    get isHotfix(): boolean {
        return this.currentIssueLabels.includes(this.hotfix);
    }

    get isRelease(): boolean {
        return this.currentIssueLabels.includes(this.release);
    }

    get isDocs(): boolean {
        return this.currentIssueLabels.includes(this.docs);
    }

    get isDocumentation(): boolean {
        return this.currentIssueLabels.includes(this.documentation);
    }

    get isChore(): boolean {
        return this.currentIssueLabels.includes(this.chore);
    }

    get isMaintenance(): boolean {
        return this.currentIssueLabels.includes(this.maintenance);
    }

    get sizeLabels(): string[] {
        return [this.sizeXxl, this.sizeXl, this.sizeL, this.sizeM, this.sizeS, this.sizeXs];
    }

    get sizedLabelOnIssue(): string | undefined {
        if (this.currentIssueLabels.includes(this.sizeXxl)) {
            return this.sizeXxl;
        } else if (this.currentIssueLabels.includes(this.sizeXl)) {
            return this.sizeXl;
        } else if (this.currentIssueLabels.includes(this.sizeL)) {
            return this.sizeL;
        } else if (this.currentIssueLabels.includes(this.sizeM)) {
            return this.sizeM;
        } else if (this.currentIssueLabels.includes(this.sizeS)) {
            return this.sizeS;
        } else if (this.currentIssueLabels.includes(this.sizeXs)) {
            return this.sizeXs;
        }
        return undefined;
    }

    get sizedLabelOnPullRequest(): string | undefined {
        if (this.currentPullRequestLabels.includes(this.sizeXxl)) {
            return this.sizeXxl;
        } else if (this.currentPullRequestLabels.includes(this.sizeXl)) {
            return this.sizeXl;
        } else if (this.currentPullRequestLabels.includes(this.sizeL)) {
            return this.sizeL;
        } else if (this.currentPullRequestLabels.includes(this.sizeM)) {
            return this.sizeM;
        } else if (this.currentPullRequestLabels.includes(this.sizeS)) {
            return this.sizeS;
        } else if (this.currentPullRequestLabels.includes(this.sizeXs)) {
            return this.sizeXs;
        }
        return undefined;
    }

    get isIssueSized(): boolean {
        return this.sizedLabelOnIssue !== undefined;
    }

    get isPullRequestSized(): boolean {
        return this.sizedLabelOnPullRequest !== undefined;
    }

    get priorityLabels(): string[] {
        return [this.priorityHigh, this.priorityMedium, this.priorityLow, this.priorityNone];
    }

    get priorityLabelOnIssue(): string | undefined {
        if (this.currentIssueLabels.includes(this.priorityHigh)) {
            return this.priorityHigh;
        } else if (this.currentIssueLabels.includes(this.priorityMedium)) {
            return this.priorityMedium;
        } else if (this.currentIssueLabels.includes(this.priorityLow)) {
            return this.priorityLow;
        } else if (this.currentIssueLabels.includes(this.priorityNone)) {
            return this.priorityNone;
        }
        return undefined;
    }

    get priorityLabelOnIssueProcessable(): boolean {
        return this.currentIssueLabels.includes(this.priorityHigh) ||
               this.currentIssueLabels.includes(this.priorityMedium) ||
               this.currentIssueLabels.includes(this.priorityLow);
    }

    get priorityLabelOnPullRequest(): string | undefined {
        if (this.currentPullRequestLabels.includes(this.priorityHigh)) {
            return this.priorityHigh;
        } else if (this.currentPullRequestLabels.includes(this.priorityMedium)) {
            return this.priorityMedium;
        } else if (this.currentPullRequestLabels.includes(this.priorityLow)) {
            return this.priorityLow;
        } else if (this.currentPullRequestLabels.includes(this.priorityNone)) {
            return this.priorityNone;
        }
        return undefined;
    }

    get priorityLabelOnPullRequestProcessable(): boolean {
        return this.currentPullRequestLabels.includes(this.priorityHigh) ||
               this.currentPullRequestLabels.includes(this.priorityMedium) ||
               this.currentPullRequestLabels.includes(this.priorityLow);
    }

    get isIssuePrioritized(): boolean {
        return this.priorityLabelOnIssue !== undefined && this.priorityLabelOnIssue !== this.priorityNone;
    }

    get isPullRequestPrioritized(): boolean {
        return this.priorityLabelOnPullRequest !== undefined && this.priorityLabelOnPullRequest !== this.priorityNone;
    }

    constructor(
        branchManagementLauncherLabel: string,
        bug: string,
        bugfix: string,
        hotfix: string,
        enhancement: string,
        feature: string,
        release: string,
        question: string,
        help: string,
        deploy: string,
        deployed: string,
        docs: string,
        documentation: string,
        chore: string,
        maintenance: string,
        priorityHigh: string,
        priorityMedium: string,
        priorityLow: string,
        priorityNone: string,
        sizeXxl: string,
        sizeXl: string,
        sizeL: string,
        sizeM: string,
        sizeS: string,
        sizeXs: string,
        lifecycle: Partial<CopilotLifecycleLabels> = {},
    ) {
        this.branchManagementLauncherLabel = branchManagementLauncherLabel;
        this.bug = bug;
        this.bugfix = bugfix;
        this.hotfix = hotfix;
        this.enhancement = enhancement;
        this.feature = feature;
        this.release = release;
        this.question = question;
        this.help = help;
        this.deploy = deploy;
        this.deployed = deployed;
        this.docs = docs;
        this.documentation = documentation;
        this.chore = chore;
        this.maintenance = maintenance;
        this.sizeXxl = sizeXxl;
        this.sizeXl = sizeXl;
        this.sizeL = sizeL;
        this.sizeM = sizeM;
        this.sizeS = sizeS;
        this.sizeXs = sizeXs;
        this.priorityHigh = priorityHigh;
        this.priorityMedium = priorityMedium;
        this.priorityLow = priorityLow;
        this.priorityNone = priorityNone;
        this.lifecycle = { ...DEFAULT_COPILOT_LIFECYCLE_LABELS, ...lifecycle };
    }
}
