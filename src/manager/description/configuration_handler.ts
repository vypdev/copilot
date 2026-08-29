import { Config } from "../../data/model/config";
import type { Execution } from "../../data/model/execution";
import type { ExecutionConfigurationQuery } from "../../application/ports/execution_configuration_ports";
import { logError } from "../../utils/logger";
import { IssueContentInterface } from "./base/issue_content_interface";


export class ConfigurationHandler extends IssueContentInterface {
    get id(): string {
        return 'configuration'
    }

    get visibleContent(): boolean {
        return false;
    }

    update = async (execution: Execution) => {
        try {
            const current = execution.currentConfiguration;
            const payload: Record<string, unknown> = {
                branchType: current.branchType,
                releaseBranch: current.releaseBranch,
                workingBranch: current.workingBranch,
                parentBranch: current.parentBranch,
                hotfixOriginBranch: current.hotfixOriginBranch,
                hotfixBranch: current.hotfixBranch,
                branchConfiguration: current.branchConfiguration,
                recommendationState: current.recommendationState,
            };

            const storedRaw = await this.internalGetter(execution);
            if (storedRaw != null && storedRaw.trim().length > 0) {
                try {
                    const stored = JSON.parse(storedRaw) as Record<string, unknown>;
                    // Merge all fields from stored that are undefined in current payload
                    for (const key in stored) {
                        if (payload[key] === undefined && stored[key] !== undefined) {
                            payload[key] = stored[key];
                        }
                    }
                } catch {
                    /* ignore parse errors, save current as-is */
                }
            }

            // Ensure results is never saved to prevent payload bloat
            delete payload['results'];

            return await this.internalUpdate(execution, JSON.stringify(payload, null, 4));
        } catch (error) {
            logError(`Error updating issue description: ${error}`);
            return undefined;
        }
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
