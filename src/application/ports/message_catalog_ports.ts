import type { AgentConfiguration } from '../../domain/agent';
import type {
    CatalogMessage,
    MessageCatalogDefinition,
    ResolvedMessageCatalog,
    CatalogResolutionObservation,
} from '../../domain/message_catalog';

export interface MessageCatalogResolutionRequest<Id extends string> {
    readonly targetLocale: string;
    readonly ids: readonly Id[];
    readonly sourceCatalog: MessageCatalogDefinition<Id>;
    readonly bundledCatalogs: readonly MessageCatalogDefinition<Id>[];
    readonly configuration?: Readonly<AgentConfiguration>;
}

export interface MessageCatalogResolutionPort {
    resolve<Id extends string>(
        request: MessageCatalogResolutionRequest<Id>,
    ): Promise<ResolvedMessageCatalog<Id>>;
    observations?(): readonly CatalogResolutionObservation[];
}

export interface DynamicMessageCatalogResponse<Id extends string> {
    readonly targetLocale: string;
    readonly messages: Readonly<Record<Id, CatalogMessage>>;
}
