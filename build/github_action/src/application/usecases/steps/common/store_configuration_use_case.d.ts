import { Execution } from "../../../../data/model/execution";
import type { ConfigurationStorePort } from "../../../ports/configuration_store_ports";
import { ParamUseCase } from "../../base/param_usecase";
/**
 * Store las configuration in the description
 */
export declare class StoreConfigurationUseCase implements ParamUseCase<Execution, void> {
    private readonly configurationStorePort;
    taskId: string;
    constructor(configurationStorePort: ConfigurationStorePort);
    invoke(param: Execution): Promise<void>;
}
