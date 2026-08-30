import type { ResultPublicationContext, ResultPublicationPresentation } from './result_publication_contracts';
type ImageSelector = (images: string[]) => string | undefined;
export declare function selectResultPublicationPresentation(context: ResultPublicationContext, selectImage: ImageSelector): ResultPublicationPresentation;
export {};
