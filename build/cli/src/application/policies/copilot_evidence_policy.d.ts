import { type Result } from '../../data/model/result';
import type { CopilotEvidence } from '../ports/copilot_evidence_ports';
export interface CopilotEvidenceContext {
    readonly eventName: string;
    readonly headSha?: string;
    readonly summary: string;
    readonly results: readonly Result[];
}
/** Creates a stable native Check Run projection without performing GitHub I/O. */
export declare function buildCopilotEvidence(context: CopilotEvidenceContext): CopilotEvidence | undefined;
