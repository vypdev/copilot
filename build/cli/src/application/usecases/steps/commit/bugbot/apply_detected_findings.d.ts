import type { Execution } from "../../../../../data/model/execution";
import type { BugbotFindingPublicationPorts } from "../../../../../application/ports/bugbot_finding_publication_ports";
import type { BugbotFindingResolutionPorts } from "../../../../../application/ports/bugbot_finding_resolution_ports";
import type { BugbotContext } from "./types";
import { type PreparedBugbotFindings } from "./prepare_bugbot_findings";
export declare function prepareDetectedFindings(execution: Execution, response: unknown): PreparedBugbotFindings | undefined;
export declare function applyDetectedFindings(execution: Execution, context: BugbotContext, prepared: PreparedBugbotFindings, publicationPorts: BugbotFindingPublicationPorts, resolutionPorts: BugbotFindingResolutionPorts): Promise<Error[]>;
