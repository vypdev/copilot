import { AGENT_PLAN } from '../../policies/agent_task_policy';
import type { LanguageQueryPort } from '../../ports/agent_language_ports';
import type {
    MessageCatalogResolutionPort,
    MessageCatalogResolutionRequest,
} from '../../ports/message_catalog_ports';
import {
    MESSAGE_CATALOG_VERSION,
    selectBundledMessageCatalog,
    validateCatalogDefinition,
    validateDynamicCatalogMessages,
    type CatalogFallbackReason,
    type CatalogMessage,
    type ResolvedMessageCatalog,
    type CatalogResolutionObservation,
} from '../../../domain/message_catalog';
import { canonicalizeLocaleTag } from '../../../domain/locale';
import { getLocalizeMessageCatalogPrompt } from '../../../prompts/localize_message_catalog';
import { logInfo } from '../../ports/logging_ports';

export class ResolveMessageCatalogUseCase implements MessageCatalogResolutionPort {
    private readonly cache = new Map<string, ResolvedMessageCatalog<string>>();
    private readonly resolutionObservations = new Map<string, CatalogResolutionObservation>();

    constructor(private readonly language: LanguageQueryPort) {}

    async resolve<Id extends string>(
        request: MessageCatalogResolutionRequest<Id>,
    ): Promise<ResolvedMessageCatalog<Id>> {
        const targetLocale = canonicalizeLocaleTag(request.targetLocale);
        const definitionErrors = [request.sourceCatalog, ...request.bundledCatalogs]
            .flatMap(catalog => validateCatalogDefinition(catalog, request.ids));
        if (definitionErrors.length > 0) {
            throw new Error(`Invalid bundled message catalog: ${[...new Set(definitionErrors)].join(', ')}.`);
        }
        const bundled = selectBundledMessageCatalog(targetLocale, request.bundledCatalogs);
        if (bundled) return this.observe(bundled, request.ids.length);

        const configurationKey = request.configuration
            ? [request.configuration.provider, request.configuration.modelProvider ?? '', request.configuration.model].join('/')
            : 'unavailable';
        const cacheKey = [MESSAGE_CATALOG_VERSION, targetLocale, configurationKey, ...[...request.ids].sort()].join('\0');
        const cached = this.cache.get(cacheKey);
        if (cached) return cached as ResolvedMessageCatalog<Id>;
        if (!request.configuration?.model.trim()) {
            return this.cacheFallback(cacheKey, request, targetLocale, 'dynamic-provider-unavailable');
        }
        try {
            const response = await this.language.query({
                configuration: request.configuration,
                agentId: AGENT_PLAN,
                prompt: getLocalizeMessageCatalogPrompt({
                    targetLocale,
                    messages: selectMessages(request.sourceCatalog.messages, request.ids),
                }),
                options: {
                    expectJson: true,
                    schemaName: 'localized_message_catalog',
                    schema: buildCatalogResponseSchema(request.sourceCatalog.messages, request.ids),
                },
            });
            if (!response || typeof response !== 'object' || Array.isArray(response)) {
                return this.cacheFallback(cacheKey, request, targetLocale, 'dynamic-response-invalid');
            }
            let responseTarget = '';
            try {
                responseTarget = typeof response.targetLocale === 'string'
                    ? canonicalizeLocaleTag(response.targetLocale)
                    : '';
            } catch {
                return this.cacheFallback(cacheKey, request, targetLocale, 'dynamic-response-invalid');
            }
            if (responseTarget !== targetLocale
                || !validateDynamicCatalogMessages(response.messages, request.sourceCatalog.messages, request.ids)) {
                return this.cacheFallback(cacheKey, request, targetLocale, 'dynamic-response-invalid');
            }
            const resolved = Object.freeze({
                requestedLocale: targetLocale,
                resolvedLocale: targetLocale,
                source: 'dynamic' as const,
                messages: Object.freeze({ ...response.messages }) as Readonly<Record<Id, CatalogMessage>>,
            });
            this.cache.set(cacheKey, resolved as ResolvedMessageCatalog<string>);
            logInfo(`Localization catalog resolved dynamically for ${targetLocale}; descriptor count=${request.ids.length}.`);
            return this.observe(resolved, request.ids.length);
        } catch {
            return this.cacheFallback(cacheKey, request, targetLocale, 'dynamic-request-failed');
        }
    }

    observations(): readonly CatalogResolutionObservation[] {
        return Object.freeze([...this.resolutionObservations.values()]);
    }

    private cacheFallback<Id extends string>(
        cacheKey: string,
        request: MessageCatalogResolutionRequest<Id>,
        targetLocale: string,
        fallbackReason: CatalogFallbackReason,
    ): ResolvedMessageCatalog<Id> {
        const fallback = Object.freeze({
            requestedLocale: targetLocale,
            resolvedLocale: canonicalizeLocaleTag(request.sourceCatalog.locale),
            source: 'fallback' as const,
            messages: request.sourceCatalog.messages,
            fallbackReason,
        });
        this.cache.set(cacheKey, fallback as ResolvedMessageCatalog<string>);
        logInfo(`Localization catalog fell back to en-US; reason=${fallbackReason}; requested=${targetLocale}.`);
        return this.observe(fallback, request.ids.length);
    }

    private observe<Id extends string>(
        resolved: ResolvedMessageCatalog<Id>,
        descriptorCount: number,
    ): ResolvedMessageCatalog<Id> {
        const observation = Object.freeze({
            requestedLocale: resolved.requestedLocale,
            resolvedLocale: resolved.resolvedLocale,
            source: resolved.source,
            descriptorCount,
            ...(resolved.fallbackReason ? { fallbackReason: resolved.fallbackReason } : {}),
        });
        this.resolutionObservations.set(
            [observation.requestedLocale, observation.resolvedLocale, observation.source, descriptorCount].join('\0'),
            observation,
        );
        return resolved;
    }
}

function selectMessages<Id extends string>(
    messages: Readonly<Record<Id, CatalogMessage>>,
    ids: readonly Id[],
): Readonly<Record<Id, CatalogMessage>> {
    return Object.freeze(Object.fromEntries(ids.map(id => [id, messages[id]])) as Record<Id, CatalogMessage>);
}

export function buildCatalogResponseSchema<Id extends string>(
    source: Readonly<Record<Id, CatalogMessage>>,
    ids: readonly Id[],
): Record<string, unknown> {
    const properties = Object.fromEntries(ids.map(id => [id, typeof source[id] === 'string'
        ? { type: 'string', minLength: 1, maxLength: 2_000 }
        : {
            type: 'object',
            properties: {
                one: { type: 'string', minLength: 1, maxLength: 2_000 },
                other: { type: 'string', minLength: 1, maxLength: 2_000 },
            },
            required: ['one', 'other'],
            additionalProperties: false,
        }]));
    return {
        type: 'object',
        properties: {
            targetLocale: { type: 'string', minLength: 1, maxLength: 255 },
            messages: {
                type: 'object',
                properties,
                required: [...ids],
                additionalProperties: false,
            },
        },
        required: ['targetLocale', 'messages'],
        additionalProperties: false,
    };
}
