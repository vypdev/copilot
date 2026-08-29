import type { Images } from '../../data/model/images';
import type { Result } from '../../data/model/result';
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
type ImageSelector = (images: string[]) => string | undefined;
export declare function resolveResultPublicationPresentation(context: ResultPublicationContext, selectImage: ImageSelector): ResultPublicationPresentation;
export declare function renderResultSections(results: ReadonlyArray<Result>): ResultPublicationSections;
export declare function buildDebugLogSection(debug: boolean, logsText: string): string;
export declare function hasPublishableContent(sections: ResultPublicationSections, debugLogSection: string): boolean;
export {};
