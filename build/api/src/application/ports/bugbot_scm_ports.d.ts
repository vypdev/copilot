import type { BugbotContextPorts } from './bugbot_context_ports';
import type { BugbotFindingPublicationPorts } from './bugbot_finding_publication_ports';
import type { BugbotFindingResolutionPorts } from './bugbot_finding_resolution_ports';
import type { BugbotPresentationMutationPorts, BugbotReconciliationSnapshotPorts } from './bugbot_reconciliation_ports';
/** Complete repository-bound SCM surface consumed by one Bugbot review. */
export interface BugbotScmPorts {
    readonly context: BugbotContextPorts;
    readonly publication: BugbotFindingPublicationPorts;
    readonly resolution: BugbotFindingResolutionPorts;
    readonly reconciliation: {
        readonly snapshot: BugbotReconciliationSnapshotPorts;
        readonly presentation: BugbotPresentationMutationPorts;
    };
}
