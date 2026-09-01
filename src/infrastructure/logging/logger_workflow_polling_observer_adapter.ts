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

    providerRetry(observation: {
        reason: 'rate_limit' | 'transient';
        attempt: number;
        delayMilliseconds: number;
        resetEpochSeconds?: number;
    }): void {
        logDebugInfo('GitHub workflow polling retry scheduled.', false, {
            reason: observation.reason,
            attempt: observation.attempt,
            delayMilliseconds: observation.delayMilliseconds,
            ...(observation.resetEpochSeconds === undefined
                ? {}
                : { resetEpochSeconds: observation.resetEpochSeconds }),
        });
    }
}
