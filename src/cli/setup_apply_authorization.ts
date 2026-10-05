import { getCurrentAttachedBranch, getCurrentHeadSha, getGitInfo, getGitRepositoryRoot } from '../cli_context';
import type { SetupConfiguration, SetupRemoteConfiguration } from '../domain/setup';
import type { AuditConfiguredSetupPatUseCase } from '../application/usecases/setup/audit_configured_setup_pat_use_case';
import { VerifyWebSetupApplyUseCase } from '../application/usecases/setup/verify_web_setup_apply_use_case';
import { ApplicationError } from '../application/errors/application_error';
import type { SetupRemoteConfigurationReadPort } from '../application/ports/setup_wizard_ports';
import { SetupTerminalCancelledError } from './setup_credential_prompt_adapter';
import { captureSetupApplySnapshot, setupApplySnapshotMatches } from './setup_apply_snapshot';
import type { WebSetupBridge } from './web_setup_bridge';

export interface WebApplyAuthorizationInput {
  readonly bridge: WebSetupBridge;
  readonly cwd: string;
  readonly owner: string;
  readonly repository: string;
  readonly checkoutRoot: string;
  readonly initialBranch?: string;
  readonly initialHead?: string;
  readonly selectedFiles?: readonly string[];
  readonly fileSnapshot?: ReturnType<typeof captureSetupApplySnapshot>;
  readonly approvedRemote?: SetupRemoteConfiguration;
  readonly configuration: SetupConfiguration;
  readonly setupToken?: string;
  readonly remoteReader: SetupRemoteConfigurationReadPort;
  readonly permissionAudit: AuditConfiguredSetupPatUseCase;
  readonly onPermissionCleanupPending?: () => void;
}

/** Web transport and Git facts for the application-owned final approval. */
export async function authorizeWebSetupApply(input: WebApplyAuthorizationInput): Promise<'continue' | 'cancelled'> {
  const { bridge } = input;
  if (!input.approvedRemote || !input.selectedFiles || !input.fileSnapshot || !input.initialBranch || !input.initialHead || !input.setupToken) {
    throw new ApplicationError('configuration.invalid', 'The approved setup evidence is incomplete. No mutation started; restart and review a new plan.');
  }
  const authorization = await new VerifyWebSetupApplyUseCase({
    confirm: async () => {
      const answer = await bridge.ask({ kind: 'confirm', title: 'Apply this setup now?', copyId: 'apply.confirm',
        description: 'This is the final approval. Local files and selected GitHub resources may change. A partial result may require inspection before retrying.',
        choices: ['Apply setup', 'Stop without applying'] });
      return answer === undefined ? undefined : answer === 'Apply setup' ? 'apply' : 'stop';
    },
    readRepositoryFacts: () => {
      const current = getGitInfo();
      return 'error' in current ? undefined : {
        owner: current.owner, repository: current.repo, checkoutRoot: getGitRepositoryRoot(input.cwd),
        branch: getCurrentAttachedBranch(input.cwd) ?? '', head: getCurrentHeadSha() ?? '',
      };
    },
    fileSnapshotMatches: setupApplySnapshotMatches,
    remote: input.remoteReader,
    permissionAudit: input.permissionAudit,
    onPermissionCleanupPending: input.onPermissionCleanupPending,
    sessionState: () => bridge.snapshot().outcome === 'cancelled' ? 'cancelled'
      : bridge.snapshot().outcome ? 'ended' : 'active',
  }).execute({
    repository: { owner: input.owner, repository: input.repository, checkoutRoot: input.checkoutRoot,
      branch: input.initialBranch, head: input.initialHead },
    selectedFiles: input.selectedFiles, fileSnapshot: input.fileSnapshot, approvedRemote: input.approvedRemote,
    configuration: input.configuration, setupToken: input.setupToken,
  });
  if (authorization === 'cancelled') throw new SetupTerminalCancelledError();
  return authorization === 'declined' ? 'cancelled' : 'continue';
}
