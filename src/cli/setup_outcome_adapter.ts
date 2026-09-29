import { toApplicationError } from '../application/errors/application_error';
import type { SetupJourneyUseCase } from '../application/usecases/setup/setup_journey_use_case';
import { logError, logInfo } from '../utils/logger';
import { SetupTerminalCancelledError } from './setup_credential_prompt_adapter';
import { setupResultReason } from './setup_result_receipt';
import type { WebSetupBridge } from './web_setup_bridge';
import type { WebSetupServer } from './web_setup_server';

interface FailureContext {
  readonly journey?: SetupJourneyUseCase;
  readonly bridge?: WebSetupBridge;
  readonly mutationStarted: boolean;
  readonly applyStarted: boolean;
  readonly guidedBotIdentity: boolean;
}

/** Terminal diagnostics are separate from the redacted browser result. */
export function reportSetupFailure(error: unknown, context: FailureContext): number {
  const cancelled = error instanceof SetupTerminalCancelledError;
  context.journey?.finish(context.mutationStarted ? 'partial' : cancelled ? 'cancelled' : 'blocked');
  const normalized = cancelled ? undefined : toApplicationError(error, 'workflow.failed', 'Setup failed.');
  context.bridge?.resultReason(cancelled ? 'cancelled' : setupResultReason(normalized!.code), normalized?.correlationId);
  if (context.mutationStarted && !context.applyStarted) {
    logInfo('A temporary credential-health workflow create was attempted before Apply. Inspect the selected branch and GitHub workflow history before retrying; a failed request may still have reached GitHub.');
  }
  if (context.guidedBotIdentity) {
    logInfo(context.applyStarted
      ? 'Setup may be partially applied. Inspect the GitHub Secret before deleting or replacing the bot PAT.'
      : 'No bot Secret write started. If you generated an unused bot PAT in GitHub, delete it there; Copilot cannot revoke it.');
  }
  if (cancelled) {
    logInfo(context.mutationStarted
      ? 'Setup stopped after a possible credential-health workflow change. Inspect the selected branch and GitHub workflow history before retrying.'
      : 'Setup cancelled. No changes were applied.');
    return 130;
  }
  logError(normalized!);
  return 1;
}

export async function finishWebSetupSession(bridge?: WebSetupBridge, server?: WebSetupServer,
  exitCode?: number | string | null): Promise<void> {
  if (!bridge || !server) return;
  const outcome = bridge.snapshot().journey?.outcome ?? (exitCode ? 'blocked' : 'cancelled');
  bridge.finish(outcome, outcome === 'complete'
    ? 'Setup completed. Delete the temporary setup PAT in GitHub; keep the bot PAT while its Secret is in use.'
    : outcome === 'dry-run' ? 'Dry run complete. No files or GitHub resources changed.'
      : outcome === 'partial' ? 'Setup may be partial. Inspect GitHub resources and run copilot doctor --read-only before retrying.'
        : 'No further setup changes will be applied. Any PAT already created in GitHub still exists until you delete it there.');
  logInfo('The local browser page shows the result. Choose “Close local session” there, or stop this command with Ctrl+C.');
  await server.closed;
}
