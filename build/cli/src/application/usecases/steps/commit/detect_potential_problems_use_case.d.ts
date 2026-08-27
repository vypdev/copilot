import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { FindingsQueryPort } from "../../../ports/agent_findings_ports";
import { ParamUseCase } from "../../base/param_usecase";
import type { BugbotContextPorts } from "../../../ports/bugbot_context_ports";
import type { BugbotFindingPublicationPorts } from "../../../ports/bugbot_finding_publication_ports";
import type { BugbotFindingResolutionPorts } from "../../../ports/bugbot_finding_resolution_ports";
export type { BugbotFinding } from "./bugbot/types";
export declare class DetectPotentialProblemsUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly aiRepository;
    private readonly contextPorts;
    private readonly publicationPorts;
    private readonly resolutionPorts;
    taskId: string;
    constructor(aiRepository: FindingsQueryPort, contextPorts: BugbotContextPorts, publicationPorts: BugbotFindingPublicationPorts, resolutionPorts: BugbotFindingResolutionPorts);
    invoke(param: Execution): Promise<Result[]>;
}
