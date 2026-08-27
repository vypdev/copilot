import { Config } from "../../data/model/config";
import type { Execution } from "../../data/model/execution";
import type { ExecutionConfigurationQuery } from "../../application/ports/execution_configuration_ports";
import { IssueContentInterface } from "./base/issue_content_interface";
export declare class ConfigurationHandler extends IssueContentInterface {
    get id(): string;
    get visibleContent(): boolean;
    update: (execution: Execution) => Promise<string | undefined>;
    get: (query: ExecutionConfigurationQuery) => Promise<Config | undefined>;
}
