import type { BugbotFindingResolutionPorts } from '../../../../../application/ports/bugbot_finding_resolution_ports';
import type { Execution } from '../../../../../data/model/execution';
import type { BugbotContext, BugbotFindingResolution } from './types';
export interface MarkFindingsResolvedParam {
    execution: Execution;
    context: BugbotContext;
    resolvedFindingIds: Set<string>;
    resolvedFindingResolutions?: ReadonlyMap<string, BugbotFindingResolution>;
    ports: BugbotFindingResolutionPorts;
}
export declare function markFindingsResolved(param: MarkFindingsResolvedParam): Promise<Error[]>;
