import type { AgentConfiguration } from '../../domain/agent';
import {
  renderCatalogMessage,
  selectBundledMessageCatalog,
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
    ) => renderCatalogMessage(resolved.messages[id], variables, resolved.requestedLocale, count),
  });
}

export function resolveStaticMessageCatalogView<Id extends string>(
  locale: string,
  sourceCatalog: MessageCatalogDefinition<Id>,
  bundledCatalogs: readonly MessageCatalogDefinition<Id>[],
): ResolvedMessageCatalogView<Id> {
  const requestedLocale = canonicalizeLocaleTag(locale || DEFAULT_REPOSITORY_LOCALE);
  const resolved = selectBundledMessageCatalog(requestedLocale, bundledCatalogs) ?? Object.freeze({
    requestedLocale,
    resolvedLocale: canonicalizeLocaleTag(sourceCatalog.locale),
    source: 'fallback' as const,
    messages: sourceCatalog.messages,
    fallbackReason: 'dynamic-provider-unavailable' as const,
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
  return toResolvedMessageCatalogView(await resolver.resolve({
    targetLocale: locale || DEFAULT_REPOSITORY_LOCALE,
    ids,
    sourceCatalog,
    bundledCatalogs,
    configuration,
  }));
}
