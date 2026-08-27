import type { BugbotFindingResolutionPorts } from "../../../../../application/ports/bugbot_finding_resolution_ports";
import type { Execution } from "../../../../../data/model/execution";
import type { BugbotContext } from "./types";
export interface MarkFindingsResolvedParam {
    execution: Execution;
    context: BugbotContext;
    resolvedFindingIds: Set<string>;
    ports: BugbotFindingResolutionPorts;
}
export declare function markFindingsResolved(param: MarkFindingsResolvedParam): Promise<Error[]>;
