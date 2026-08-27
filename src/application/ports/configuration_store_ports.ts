import type { Execution } from '../../data/model/execution';

export interface ConfigurationStorePort {
    update(execution: Execution): Promise<string | undefined>;
}
