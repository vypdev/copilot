import type { SetupManagementPorts } from '../../ports/setup_management_ports';
import type { SetupRemoteConfiguration, SetupVariablesWriteResult } from '../../../domain/setup';
import type { SetupInstallation, SetupQuickChange } from '../../../domain/setup_management';
import { buildSetupManagementView, managementFingerprint, planQuickChange } from '../../policies/setup_management_policy';

type Connection = { token: string; remote: SetupRemoteConfiguration };
type SessionState = { connection?: Connection; changed: boolean };

/** Management owns the edit transaction; presenters cannot select a provider write. */
export class ManageSetupUseCase {
  private started = false;
  constructor(private readonly ports: SetupManagementPorts, private readonly readOnly = false) {}

  async execute(): Promise<'continue' | 'complete' | 'partial' | 'cancelled' | 'blocked'> {
    if (this.started) throw new Error('A management session can run only once.');
    this.started = true;
    const state: SessionState = { changed: false };
    while (this.ports.active()) {
      const local = this.ports.inspectLocal();
      const view = buildSetupManagementView(local, state.connection?.remote, state.changed);
      const choice = await this.ports.choose(this.readOnly ? { ...view, settings: view.settings.map(setting => ({ ...setting, editable: false })) } : view);
      if (!this.ports.active() || !choice) break;
      if (choice === 'close') return 'complete';
      if (choice === 'wizard') return 'continue';
      if (choice === 'connect' || choice === 'refresh') await this.connect(state);
      else if (await this.adjust(state, local, choice) === 'partial') return 'partial';
    }
    return state.changed ? 'complete' : 'cancelled';
  }

  private async connect(state: SessionState): Promise<void> {
    const token = state.connection?.token ?? await this.ports.requestToken();
    if (!token) return;
    try {
      state.connection = { token, remote: await this.ports.inspectRemote(token) };
      this.ports.notify('connected');
    } catch {
      state.connection = undefined;
      this.ports.notify('blocked');
    }
  }

  private async adjust(state: SessionState, local: SetupInstallation, choice: string): Promise<'partial' | undefined> {
    if (this.readOnly || !state.connection || !choice.startsWith('edit:')) { this.ports.notify('blocked'); return; }
    const connection = state.connection;
    const plan = await this.review(connection, local, choice.slice(5));
    if (!plan) return;
    const audit = await this.audit(state, connection, plan);
    if (audit === 'partial') return 'partial';
    if (audit !== 'accepted' || !this.ports.active()) return;
    const fresh = await this.inspectApprovedChange(state, connection, plan);
    if (!fresh) return;
    return this.writeAndVerify(state, connection, plan, fresh);
  }

  private async review(connection: Connection, local: SetupInstallation, id: string): Promise<SetupQuickChange | undefined> {
    const current = buildSetupManagementView(local, connection.remote).settings.find(item => item.id === id);
    if (!current?.editable || current.value === undefined) { this.ports.notify('blocked'); return; }
    const value = await this.ports.requestValue(id, current.value);
    if (value === undefined) return;
    const plan = planQuickChange(local, connection.remote, id, value);
    if (!plan) { this.ports.notify('invalid'); return; }
    if (plan.before === plan.after) { this.ports.notify('unchanged'); return; }
    if (await this.ports.confirm(plan) && this.ports.active()) return plan;
  }

  private async audit(state: SessionState, connection: Connection, plan: SetupQuickChange): Promise<'accepted' | 'blocked' | 'partial'> {
    let audit: 'accepted' | 'blocked' | 'cleanup-pending';
    try { audit = await this.ports.audit(plan, connection.token, connection.remote); }
    catch { this.ports.possibleMutation(); this.ports.notify('partial'); return 'partial'; }
    if (audit === 'cleanup-pending') { this.ports.possibleMutation(); return 'partial'; }
    if (audit === 'blocked') {
      this.ports.notify('blocked'); state.connection = undefined;
    }
    return audit;
  }

  private async inspectApprovedChange(state: SessionState, connection: Connection, plan: SetupQuickChange): Promise<SetupRemoteConfiguration | undefined> {
    let fresh: SetupRemoteConfiguration;
    try { fresh = await this.ports.inspectRemote(connection.token); }
    catch { this.ports.notify('blocked'); return; }
    if (!this.ports.active()) return;
    if (!this.ports.approvalCurrent() || managementFingerprint(this.ports.inspectLocal(), fresh, plan.variable) !== plan.fingerprint) {
      state.connection = { ...connection, remote: fresh }; this.ports.notify('stale'); return;
    }
    return fresh;
  }

  private async writeAndVerify(state: SessionState, connection: Connection, plan: SetupQuickChange, fresh: SetupRemoteConfiguration): Promise<'partial' | undefined> {
    this.ports.possibleMutation();
    try {
      const result = await this.ports.write(plan, connection.token, fresh);
      const remote = await this.ports.inspectRemote(connection.token);
      state.connection = { ...connection, remote };
      const success = this.matchesReceipt(result, remote, plan);
      this.ports.recordWrite(success, plan.scope);
      if (!success) { this.ports.notify('partial'); return 'partial'; }
      state.changed = true;
      this.ports.notify('updated');
    } catch {
      this.ports.recordWrite(false, plan.scope); this.ports.notify('partial'); return 'partial';
    }
  }

  private matchesReceipt(result: SetupVariablesWriteResult, remote: SetupRemoteConfiguration, plan: SetupQuickChange): boolean {
    const observed = buildSetupManagementView(this.ports.inspectLocal(), remote).settings.find(item => item.id === plan.id);
    return result.errors.length === 0 && result.created + result.updated === 1
      && observed?.value === plan.after && observed.source === plan.scope;
  }
}
