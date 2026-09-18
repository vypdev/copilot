import type { AgentConfiguration } from '../../domain/agent';
import {
  renderCatalogMessage,
  selectBundledMessageCatalog,
  validateDynamicCatalogMessages,
  type CatalogFallbackReason,
  type MessageCatalogDefinition,
  type ResolvedMessageCatalog,
} from '../../domain/message_catalog';
import { canonicalizeLocaleTag, DEFAULT_REPOSITORY_LOCALE } from '../../domain/locale';
import type { MessageCatalogResolutionPort } from '../ports/message_catalog_ports';

export interface ResolvedMessageCatalogView<Id extends string> {
  readonly locale: string;
  readonly requestedLocale: string;
  readonly resolutionSource: ResolvedMessageCatalog<Id>['source'];
  readonly fallbackReason?: CatalogFallbackReason;
  message(
    id: Id,
    variables?: Readonly<Record<string, string | number>>,
    count?: number,
  ): string;
}

export function toResolvedMessageCatalogView<Id extends string>(
  resolved: ResolvedMessageCatalog<Id>,
): ResolvedMessageCatalogView<Id> {
  return Object.freeze({
    locale: resolved.resolvedLocale,
    requestedLocale: resolved.requestedLocale,
    resolutionSource: resolved.source,
    ...(resolved.fallbackReason ? { fallbackReason: resolved.fallbackReason } : {}),
    message: (
      id: Id,
      variables: Readonly<Record<string, string | number>> = {},
      count?: number,
    ) => renderCatalogMessage(resolved.messages[id], variables, resolved.resolvedLocale, count),
  });
}

export function resolveStaticMessageCatalogView<Id extends string>(
  locale: string,
  sourceCatalog: MessageCatalogDefinition<Id>,
  bundledCatalogs: readonly MessageCatalogDefinition<Id>[],
): ResolvedMessageCatalogView<Id> {
  return fallbackMessageCatalogView(locale, sourceCatalog, bundledCatalogs, 'dynamic-provider-unavailable');
}

function fallbackMessageCatalogView<Id extends string>(
  locale: string,
  sourceCatalog: MessageCatalogDefinition<Id>,
  bundledCatalogs: readonly MessageCatalogDefinition<Id>[],
  fallbackReason: CatalogFallbackReason,
): ResolvedMessageCatalogView<Id> {
  const requestedLocale = canonicalizeLocaleTag(locale || DEFAULT_REPOSITORY_LOCALE);
  const resolved = selectBundledMessageCatalog(requestedLocale, bundledCatalogs) ?? Object.freeze({
    requestedLocale,
    resolvedLocale: canonicalizeLocaleTag(sourceCatalog.locale),
    source: 'fallback' as const,
    messages: sourceCatalog.messages,
    fallbackReason,
  });
  return toResolvedMessageCatalogView(resolved);
}

export async function resolveMessageCatalogView<Id extends string>(
  locale: string,
  ids: readonly Id[],
  sourceCatalog: MessageCatalogDefinition<Id>,
  bundledCatalogs: readonly MessageCatalogDefinition<Id>[],
  configuration: Readonly<AgentConfiguration> | undefined,
  resolver: MessageCatalogResolutionPort | undefined,
): Promise<ResolvedMessageCatalogView<Id>> {
  if (!resolver) return resolveStaticMessageCatalogView(locale, sourceCatalog, bundledCatalogs);
  const requestedLocale = canonicalizeLocaleTag(locale || DEFAULT_REPOSITORY_LOCALE);
  try {
    const resolved = await resolver.resolve({
      targetLocale: locale || DEFAULT_REPOSITORY_LOCALE,
      ids,
      sourceCatalog,
      bundledCatalogs,
      configuration,
    });
    if (resolved?.requestedLocale === requestedLocale) {
      if (resolved.source === 'exact' || resolved.source === 'base') {
        const bundled = selectBundledMessageCatalog(requestedLocale, bundledCatalogs);
        if (bundled?.source === resolved.source && bundled.resolvedLocale === resolved.resolvedLocale) {
          return toResolvedMessageCatalogView(bundled);
        }
      } else if (resolved.source === 'dynamic'
        && resolved.resolvedLocale === requestedLocale
        && validateDynamicCatalogMessages(resolved.messages, sourceCatalog.messages, ids, requestedLocale)) {
        return toResolvedMessageCatalogView(resolved);
      } else if (resolved.source === 'fallback'
        && resolved.resolvedLocale === canonicalizeLocaleTag(sourceCatalog.locale)
        && (resolved.fallbackReason === 'dynamic-provider-unavailable'
          || resolved.fallbackReason === 'dynamic-response-invalid'
          || resolved.fallbackReason === 'dynamic-request-failed')) {
        return toResolvedMessageCatalogView({ ...resolved, messages: sourceCatalog.messages });
      }
    }
  } catch {
    return fallbackMessageCatalogView(locale, sourceCatalog, bundledCatalogs, 'dynamic-request-failed');
  }
  return fallbackMessageCatalogView(locale, sourceCatalog, bundledCatalogs, 'dynamic-response-invalid');
}
