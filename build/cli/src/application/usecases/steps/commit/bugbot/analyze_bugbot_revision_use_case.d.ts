import type { Execution } from '../../../../../data/model/execution';
import type { FindingsQueryPort } from '../../../../ports/agent_findings_ports';
import { type BugbotContext } from './types';
import type { PreparedBugbotFindings } from './prepare_bugbot_findings';
import type { BugbotReviewTelemetry } from './bugbot_review_telemetry';
export interface AnalyzeBugbotRevisionDependencies {
    readonly agent: FindingsQueryPort;
    readonly telemetry: BugbotReviewTelemetry;
}
/** Pure analysis phase: query, validate, normalize, deduplicate and reconcile; never mutates the SCM. */
export declare function analyzeBugbotRevision(execution: Execution, context: BugbotContext, dependencies: AnalyzeBugbotRevisionDependencies): Promise<PreparedBugbotFindings | undefined>;
