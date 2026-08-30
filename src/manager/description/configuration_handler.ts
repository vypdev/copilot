import { Config } from "../../data/model/config";
import type { Execution } from "../../data/model/execution";
import type { ExecutionConfigurationQuery } from "../../application/ports/execution_configuration_ports";
import { logError } from "../../utils/logger";
import { IssueContentInterface } from "./base/issue_content_interface";
import { buildConfigurationPayload } from './configuration_payload_policy';


export class ConfigurationHandler extends IssueContentInterface {
    get id(): string {
        return 'configuration'
    }

    get visibleContent(): boolean {
        return false;
    }

    update = async (execution: Execution) => {
        const storedRaw = await this.internalGetter(execution);
        return await this.internalUpdate(execution, buildConfigurationPayload(execution, storedRaw));
    }

    get = async (query: ExecutionConfigurationQuery): Promise<Config | undefined> => {
        try {
            const description = await this.issueDescriptionPort.getDescription(
                query.owner,
                query.repository,
                query.issueNumber,
                query.token,
            );
            const config = this.getContent(description);
            if (config === undefined) {
                return undefined;
            }
            const branchConfig = JSON.parse(config);
            return new Config(branchConfig);
        } catch (error) {
            logError(`Error reading issue configuration: ${error}`);
            throw error;
        }
    }
}
