export interface IssueTitlePort {
    getTitle(owner: string, repository: string, issueNumber: number, token: string): Promise<string | undefined>;
    updateTitleIssueFormat(owner: string, repository: string, version: string, issueTitle: string, issueNumber: number, branchManagementAlways: boolean, branchManagementEmoji: string, labels: TitleLabelFacts, token: string): Promise<string | undefined>;
    updateTitlePullRequestFormat(owner: string, repository: string, pullRequestTitle: string, issueTitle: string, issueNumber: number, pullRequestNumber: number, branchManagementAlways: boolean, branchManagementEmoji: string, labels: TitleLabelFacts, token: string): Promise<string | undefined>;
}


export interface BoundIssueTitlePort {
    getTitle(issueNumber: number): Promise<string | undefined>;
    updateIssueTitle(input: {
        readonly version: string;
        readonly currentTitle: string;
        readonly issueNumber: number;
        readonly branchManagementAlways: boolean;
        readonly branchManagementEmoji: string;
        readonly labelFacts: TitleLabelFacts;
    }): Promise<string | undefined>;
    updatePullRequestTitle(input: {
        readonly pullRequestTitle: string;
        readonly issueTitle: string;
        readonly issueNumber: number;
        readonly pullRequestNumber: number;
        readonly labelFacts: TitleLabelFacts;
    }): Promise<string | undefined>;
}

export interface TitleLabelFacts {
    readonly isHotfix: boolean;
    readonly isRelease: boolean;
    readonly isBugfix: boolean;
    readonly isBug: boolean;
    readonly isFeature: boolean;
    readonly isEnhancement: boolean;
    readonly isDocs: boolean;
    readonly isDocumentation: boolean;
    readonly isChore: boolean;
    readonly isMaintenance: boolean;
    readonly isHelp: boolean;
    readonly isQuestion: boolean;
    readonly containsBranchedLabel: boolean;
}
