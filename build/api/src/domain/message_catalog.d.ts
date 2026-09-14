export declare const MESSAGE_CATALOG_VERSION = "1";
export type CatalogResolutionSource = 'exact' | 'base' | 'dynamic' | 'fallback';
export type CatalogFallbackReason = 'dynamic-provider-unavailable' | 'dynamic-response-invalid' | 'dynamic-request-failed';
export declare const CATALOG_PLURAL_CATEGORIES: readonly ["zero", "one", "two", "few", "many", "other"];
export type CatalogPluralCategory = typeof CATALOG_PLURAL_CATEGORIES[number];
export type CatalogPluralMessage = Readonly<Partial<Record<CatalogPluralCategory, string>> & {
    readonly other: string;
}>;
export type CatalogMessage = string | CatalogPluralMessage;
export interface MessageCatalogDefinition<Id extends string = string> {
    readonly version: string;
    readonly locale: string;
    readonly compatibleBaseLanguage: string;
    readonly messages: Readonly<Record<Id, CatalogMessage>>;
}
export interface ResolvedMessageCatalog<Id extends string = string> {
    readonly requestedLocale: string;
    readonly resolvedLocale: string;
    readonly source: CatalogResolutionSource;
    readonly messages: Readonly<Record<Id, CatalogMessage>>;
    readonly fallbackReason?: CatalogFallbackReason;
}
export interface CatalogResolutionObservation {
    readonly requestedLocale: string;
    readonly resolvedLocale: string;
    readonly source: CatalogResolutionSource;
    readonly descriptorCount: number;
    readonly fallbackReason?: CatalogFallbackReason;
}
export declare function selectBundledMessageCatalog<Id extends string>(requestedValue: string, catalogs: readonly MessageCatalogDefinition<Id>[]): ResolvedMessageCatalog<Id> | undefined;
export declare function validateCatalogDefinition<Id extends string>(catalog: MessageCatalogDefinition<Id>, requiredIds: readonly Id[]): readonly string[];
export declare function validateDynamicCatalogMessages<Id extends string>(value: unknown, sourceMessages: Readonly<Record<Id, CatalogMessage>>, requiredIds: readonly Id[], targetLocale?: string): value is Readonly<Record<Id, CatalogMessage>>;
export declare function renderCatalogMessage(message: CatalogMessage, variables?: Readonly<Record<string, string | number>>, locale?: string, count?: number): string;
export declare function catalogPlaceholders(message: CatalogMessage): readonly string[];
export declare function catalogPluralCategories(locale: string): readonly CatalogPluralCategory[];
