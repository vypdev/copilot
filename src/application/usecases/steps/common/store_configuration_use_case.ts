import { Execution } from "../../../../data/model/execution";
import type { ConfigurationStorePort } from "../../../ports/configuration_store_ports";
import { logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";


/**
 * Store las configuration in the description
 */
export class StoreConfigurationUseCase implements ParamUseCase<Execution, void> {
    taskId: string = 'StoreConfigurationUseCase';
    constructor(private readonly configurationStorePort: ConfigurationStorePort) {}

    async invoke(param: Execution): Promise<void> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)
        try {
            await this.configurationStorePort.update(
                param
            )
        } catch (error) {
            logError(`StoreConfiguration: failed to update configuration.`, error instanceof Error ? { stack: (error as Error).stack } : undefined);
        }
    }
}
