import type { Images } from '../../data/model/images';

export interface ResultPublicationContext {
    isIssue: boolean;
    isPullRequest: boolean;
    issueNotBranched: boolean;
    releaseActive: boolean;
    hotfixActive: boolean;
    isBugfix: boolean;
    isFeature: boolean;
    isDocs: boolean;
    isChore: boolean;
    images: Images;
}

export interface ResultPublicationPresentation {
    title: string;
    image?: string;
}

export interface ResultPublicationSections {
    content: string;
    footer: string;
    errors: string;
}

export interface ResultPublicationTargetInput {
    isSingleAction: boolean;
    singleActionIssue: number;
    isIssue: boolean;
    issueNumber: number;
    isPullRequest: boolean;
    pullRequestNumber: number;
    isPush: boolean;
    pushIssueNumber: number;
}
