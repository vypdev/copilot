import { CONFIG_SCHEMA_VERSION, Config, requireCurrentConfigurationPayload } from "../../data/model/config";
import type { ExecutionConfigurationQuery } from "../../application/ports/execution_configuration_ports";
import type { ConfigurationPersistenceContext } from '../../application/ports/configuration_store_ports';
import { logError } from "../../utils/logger";
import { IssueContentInterface } from "./base/issue_content_interface";
import { buildConfigurationPayload } from './configuration_payload_policy';
import { toApplicationError, type ApplicationErrorRecovery } from '../../application/errors/application_error';
import { readConfigurationBlock, writeConfigurationBlock } from './configuration_markers';


export class ConfigurationHandler extends IssueContentInterface {
    get id(): string {
        return 'configuration'
    }

    get visibleContent(): boolean {
        return false;
    }

    override getContent = (description: string | undefined): string | undefined => {
        const block = readConfigurationBlock(description);
        return block.kind === 'present' ? block.content : undefined;
    };

    override updateContent = (description: string | undefined, content: string | undefined): string | undefined => {
        if (description === undefined || content === undefined) return undefined;
        const updated = writeConfigurationBlock(description, content);
        if (updated === undefined) logError('The content has a problem with open-close tags: stored configuration.');
        return updated;
    };

    update = async (query: ExecutionConfigurationQuery, context: ConfigurationPersistenceContext) => {
        const storedRaw = await this.internalGetter(query);
        return this.internalUpdate(query, buildConfigurationPayload(context, storedRaw));
    }

    get = async (query: ExecutionConfigurationQuery): Promise<Config | undefined> => {
        let description: string | undefined;
        try {
            description = await this.issueDescriptionPort.getDescription(
                query.owner,
                query.repository,
                query.issueNumber,
                query.token,
            );
        } catch (cause) {
            const semanticError = toApplicationError(cause, 'provider.unavailable', 'Unable to read issue configuration.');
            logError(semanticError);
            throw semanticError;
        }

        const variables = { issueNumber: query.issueNumber, expectedVersion: CONFIG_SCHEMA_VERSION };
        let recovery: ApplicationErrorRecovery = { id: 'stored-configuration-invalid', variables };
        try {
            const config = this.getContent(description);
            if (config === undefined) {
                if (readConfigurationBlock(description).kind === 'invalid') {
                    throw new Error('Stored configuration markers are inconsistent.');
                }
                return undefined;
            }
            const parsed: unknown = JSON.parse(config);
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const version = (parsed as Record<string, unknown>).schemaVersion;
                if (version === undefined) {
                    recovery = { id: 'stored-configuration-schema-missing', variables };
                } else if (typeof version === 'number' && Number.isSafeInteger(version)
                    && version >= 0 && version !== CONFIG_SCHEMA_VERSION) {
                    recovery = { id: 'stored-configuration-schema-unsupported', variables: { ...variables, actualVersion: version } };
                }
            }
            const branchConfig = requireCurrentConfigurationPayload(parsed);
            return new Config(branchConfig);
        } catch (cause) {
            const semanticError = toApplicationError(cause, 'configuration.invalid', 'Stored issue/PR configuration is invalid.', { recovery });
            logError(semanticError);
            throw semanticError;
        }
    }
}
