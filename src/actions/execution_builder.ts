import { Execution } from '../data/model/execution';
import type { ExecutionComponents } from '../data/model/execution_components';

export type { ExecutionComponents } from '../data/model/execution_components';

export function buildExecution(components: ExecutionComponents): Execution {
    return new Execution(components);
}
