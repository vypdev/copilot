import type { Config } from '../../data/model/config';
export interface ExecutionConfigurationQuery {
    owner: string;
    repository: string;
    issueNumber: number;
    token: string;
}
export interface ExecutionConfigurationPort {
    get(query: ExecutionConfigurationQuery): Promise<Config | undefined>;
}
