import type { WorkflowPollingObserverPort } from '../../application/ports/workflow_run_ports';
import { logDebugInfo } from '../../utils/logger';

export class LoggerWorkflowPollingObserverAdapter implements WorkflowPollingObserverPort {
    noActivePreviousRuns(): void {
        logDebugInfo('✅ No previous runs active. Continuing...');
    }

    waitingForPreviousRuns(activeRunCount: number, delayMilliseconds: number): void {
        logDebugInfo(
            `⏳ Found ${activeRunCount} previous run(s) still active. Waiting ${delayMilliseconds / 1000}s...`,
        );
    }
}
