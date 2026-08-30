import type { Result } from '../../data/model/result';
import type { ResultPublicationContext, ResultPublicationPresentation, ResultPublicationSections, ResultPublicationTargetInput } from './result_publication_contracts';
export type { ResultPublicationContext, ResultPublicationPresentation, ResultPublicationSections, ResultPublicationTargetInput, } from './result_publication_contracts';
type ImageSelector = (images: string[]) => string | undefined;
/** Resolves the GitHub discussion that receives a result comment. */
export declare function resolveResultPublicationIssueNumber(input: ResultPublicationTargetInput): number | undefined;
export declare function resolveResultPublicationPresentation(context: ResultPublicationContext, selectImage: ImageSelector): ResultPublicationPresentation;
export declare function renderResultSections(results: ReadonlyArray<Result>): ResultPublicationSections;
export declare function buildDebugLogSection(debug: boolean, logsText: string): string;
export declare function hasPublishableContent(sections: ResultPublicationSections, debugLogSection: string): boolean;
