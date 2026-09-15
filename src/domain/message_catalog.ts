import { baseLanguage, canonicalizeLocaleTag, DEFAULT_REPOSITORY_LOCALE } from './locale';

export const MESSAGE_CATALOG_VERSION = '1';

export type CatalogResolutionSource = 'exact' | 'base' | 'dynamic' | 'fallback';
export type CatalogFallbackReason =
    | 'dynamic-provider-unavailable'
    | 'dynamic-response-invalid'
    | 'dynamic-request-failed';

export const CATALOG_PLURAL_CATEGORIES = Object.freeze([
    'zero',
    'one',
    'two',
    'few',
    'many',
    'other',
] as const);

export type CatalogPluralCategory = typeof CATALOG_PLURAL_CATEGORIES[number];
export type CatalogPluralMessage = Readonly<
    Partial<Record<CatalogPluralCategory, string>> & { readonly other: string }
>;
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

export function selectBundledMessageCatalog<Id extends string>(
    requestedValue: string,
    catalogs: readonly MessageCatalogDefinition<Id>[],
): ResolvedMessageCatalog<Id> | undefined {
    const requestedLocale = canonicalizeLocaleTag(requestedValue || DEFAULT_REPOSITORY_LOCALE);
    const exact = catalogs.find(catalog => canonicalizeLocaleTag(catalog.locale) === requestedLocale);
    if (exact) return resolvedCatalog(requestedLocale, exact, 'exact');
    const language = baseLanguage(requestedLocale);
    const base = catalogs.find(catalog => catalog.compatibleBaseLanguage === language);
    return base ? resolvedCatalog(requestedLocale, base, 'base') : undefined;
}

export function validateCatalogDefinition<Id extends string>(
    catalog: MessageCatalogDefinition<Id>,
    requiredIds: readonly Id[],
): readonly string[] {
    const errors: string[] = [];
    if (catalog.version !== MESSAGE_CATALOG_VERSION) errors.push('catalog-version-mismatch');
    let catalogLocale: string | undefined;
    try {
        catalogLocale = canonicalizeLocaleTag(catalog.locale);
        if (baseLanguage(catalogLocale) !== catalog.compatibleBaseLanguage) errors.push('catalog-language-mismatch');
    } catch {
        errors.push('catalog-locale-invalid');
    }
    const required = new Set(requiredIds);
    const actual = Object.keys(catalog.messages);
    if (actual.some(id => !required.has(id as Id))) errors.push('catalog-id-unknown');
    if (requiredIds.some(id => !Object.prototype.hasOwnProperty.call(catalog.messages, id))) {
        errors.push('catalog-id-missing');
    }
    for (const id of requiredIds) {
        const message = catalog.messages[id];
        if (!validCatalogMessage(message)
            || (typeof message !== 'string' && catalogLocale
                && !pluralCategoriesMatchLocale(message, catalogLocale))) {
            errors.push(`catalog-message-invalid:${id}`);
        }
    }
    return Object.freeze(errors);
}

export function validateDynamicCatalogMessages<Id extends string>(
    value: unknown,
    sourceMessages: Readonly<Record<Id, CatalogMessage>>,
    requiredIds: readonly Id[],
    targetLocale = DEFAULT_REPOSITORY_LOCALE,
): value is Readonly<Record<Id, CatalogMessage>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const messages = value as Record<string, unknown>;
    const actualIds = Object.keys(messages).sort();
    const expectedIds = [...requiredIds].sort();
    if (actualIds.length !== expectedIds.length
        || actualIds.some((id, index) => id !== expectedIds[index])) return false;
    const pluralCategories = catalogPluralCategories(targetLocale);
    return requiredIds.every(id => dynamicMessageMatches(
        messages[id],
        sourceMessages[id],
        pluralCategories,
    ));
}

export function renderCatalogMessage(
    message: CatalogMessage,
    variables: Readonly<Record<string, string | number>> = {},
    locale = DEFAULT_REPOSITORY_LOCALE,
    count?: number,
): string {
    const template = typeof message === 'string'
        ? message
        : message[new Intl.PluralRules(canonicalizeLocaleTag(locale))
            .select(count ?? Number(variables.count ?? 0))]
            ?? message.other;
    return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/gu, (_match, key: string) => {
        const value = variables[key];
        if (value === undefined) throw new Error(`Missing catalog variable: ${key}.`);
        return typeof value === 'number'
            ? new Intl.NumberFormat(canonicalizeLocaleTag(locale)).format(value)
            : value;
    });
}

export function catalogPlaceholders(message: CatalogMessage): readonly string[] {
    const values = typeof message === 'string'
        ? [message]
        : CATALOG_PLURAL_CATEGORIES.flatMap(category => message[category] ?? []);
    return Object.freeze(values.flatMap(value => [...value.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/gu)]
        .map(match => match[1])).sort());
}

export function catalogPluralCategories(locale: string): readonly CatalogPluralCategory[] {
    const supported = new Set(
        new Intl.PluralRules(canonicalizeLocaleTag(locale)).resolvedOptions().pluralCategories,
    );
    return Object.freeze(CATALOG_PLURAL_CATEGORIES.filter(category => supported.has(category)));
}

function resolvedCatalog<Id extends string>(
    requestedLocale: string,
    catalog: MessageCatalogDefinition<Id>,
    source: 'exact' | 'base',
): ResolvedMessageCatalog<Id> {
    return Object.freeze({
        requestedLocale,
        resolvedLocale: canonicalizeLocaleTag(catalog.locale),
        source,
        messages: catalog.messages,
    });
}

function validCatalogMessage(message: unknown): message is CatalogMessage {
    if (typeof message === 'string') return validMessageText(message);
    if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
    const values = message as Record<string, unknown>;
    const keys = Object.keys(values);
    return keys.length > 0
        && keys.every(key => CATALOG_PLURAL_CATEGORIES.includes(key as CatalogPluralCategory))
        && validMessageText(values.other)
        && keys.every(key => validMessageText(values[key]))
        && pluralPlaceholderParity(values as CatalogPluralMessage);
}

function dynamicMessageMatches(
    value: unknown,
    source: CatalogMessage,
    pluralCategories: readonly CatalogPluralCategory[],
): boolean {
    if (!validCatalogMessage(value) || !source || typeof value !== typeof source) return false;
    const sourcePlaceholders = placeholdersForTemplate(
        typeof source === 'string' ? source : source.other,
    );
    if (typeof value === 'string') {
        return placeholdersForTemplate(value) === sourcePlaceholders && safeDynamicText(value);
    }
    const actualCategories = Object.keys(value).sort();
    const expectedCategories = [...pluralCategories].sort();
    return actualCategories.length === expectedCategories.length
        && actualCategories.every((category, index) => category === expectedCategories[index])
        && actualCategories.every(category => {
            const template = value[category as CatalogPluralCategory];
            return typeof template === 'string'
                && placeholdersForTemplate(template) === sourcePlaceholders
                && safeDynamicText(template);
        });
}

function validMessageText(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 2_000;
}

function safeDynamicText(value: string): boolean {
    return validMessageText(value)
        && !/[\p{Cc}\u202A-\u202E\u2066-\u2069]/u.test(value)
        && !/<!--|-->|<\/?[A-Za-z]|https?:\/\/|```|[`*_[\]~|]|(^|\s)\/(?:copilot)(?:\s|$)|@[A-Za-z0-9]/iu.test(value);
}

function pluralPlaceholderParity(message: CatalogPluralMessage): boolean {
    const expected = placeholdersForTemplate(message.other);
    return CATALOG_PLURAL_CATEGORIES.every(category => {
        const template = message[category];
        return template === undefined || placeholdersForTemplate(template) === expected;
    });
}

function pluralCategoriesMatchLocale(message: CatalogPluralMessage, locale: string): boolean {
    const actual = Object.keys(message).sort();
    const expected = [...catalogPluralCategories(locale)].sort();
    return actual.length === expected.length
        && actual.every((category, index) => category === expected[index]);
}

function placeholdersForTemplate(value: string): string {
    return [...value.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/gu)]
        .map(match => match[1])
        .sort()
        .join('\0');
}
