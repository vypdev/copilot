import type { SetupInstallation, SetupQuickChange } from '../../domain/setup_management';
import type { SetupRemoteConfiguration, SetupVariablesWriteResult } from '../../domain/setup';
import type { SetupManagementView } from '../contracts/setup_management_view';

export interface SetupManagementPorts {
  inspectLocal(): SetupInstallation;
  inspectRemote(token: string): Promise<SetupRemoteConfiguration>;
  choose(view: SetupManagementView): Promise<'wizard' | 'connect' | 'refresh' | 'close' | `edit:${string}` | undefined>;
  requestToken(): Promise<string | undefined>;
  requestValue(id: string, current: string): Promise<string | undefined>;
  confirm(change: SetupQuickChange): Promise<boolean>;
  audit(change: SetupQuickChange, token: string, remote: SetupRemoteConfiguration): Promise<'accepted' | 'blocked' | 'cleanup-pending'>;
  write(change: SetupQuickChange, token: string, remote: SetupRemoteConfiguration): Promise<SetupVariablesWriteResult>;
  notify(state: 'connected' | 'invalid' | 'unchanged' | 'stale' | 'blocked' | 'updated' | 'partial'): void;
  active(): boolean;
  approvalCurrent(): boolean;
  possibleMutation(): void;
  recordWrite(success: boolean, scope: SetupQuickChange['scope']): void;
}
