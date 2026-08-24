import type { Execution } from '../../../../../data/model/execution';
import type { FindingsQueryPort } from '../../../../ports/agent_findings_ports';
export declare function queryBugbotFindings(repository: FindingsQueryPort, execution: Execution, prompt: string): Promise<unknown>;
