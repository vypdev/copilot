import type { BugbotFindingPublicationPorts } from "./bugbot_finding_publication_ports";
import type { BugbotFindingResolutionPorts } from "./bugbot_finding_resolution_ports";
/** Route-level aggregate for the workflow that both publishes and resolves. */
export type BugbotWritePorts = BugbotFindingPublicationPorts & BugbotFindingResolutionPorts;
