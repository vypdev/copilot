import type { SetupManagementPorts } from '../../ports/setup_management_ports';
import type { SetupRemoteConfiguration } from '../../../domain/setup';
import { buildSetupManagementView, managementFingerprint, planQuickChange } from '../../policies/setup_management_policy';

/** Management owns the edit transaction; presenters cannot select a provider write. */
export class ManageSetupUseCase {
  private started = false;
  constructor(private readonly ports: SetupManagementPorts, private readonly readOnly = false) {}

  async execute(): Promise<'continue' | 'complete' | 'partial' | 'cancelled' | 'blocked'> {
    if (this.started) throw new Error('A management session can run only once.');
    this.started = true;
    let token: string | undefined;
    let remote: SetupRemoteConfiguration | undefined;
    let changed = false;
    while (this.ports.active()) {
      const local = this.ports.inspectLocal();
      const view = buildSetupManagementView(local, remote, changed);
      const choice = await this.ports.choose(this.readOnly ? { ...view, settings: view.settings.map(setting => ({ ...setting, editable: false })) } : view);
      if (!this.ports.active() || !choice || choice === 'close') return changed ? 'complete' : 'cancelled';
      if (choice === 'wizard') return 'continue';
      if (choice === 'connect' || choice === 'refresh') {
        if (!token) token = await this.ports.requestToken();
        if (!token) continue;
        try {
          remote = await this.ports.inspectRemote(token);
          this.ports.notify('connected');
        } catch {
          remote = undefined;
          token = undefined;
          this.ports.notify('blocked');
        }
        continue;
      }
      if (this.readOnly || !token || !remote || !choice.startsWith('edit:')) { this.ports.notify('blocked'); continue; }
      const id = choice.slice(5);
      const current = buildSetupManagementView(local, remote).settings.find(item => item.id === id);
      if (!current?.editable || current.value === undefined) { this.ports.notify('blocked'); continue; }
      const value = await this.ports.requestValue(id, current.value);
      if (value === undefined) continue;
      const plan = planQuickChange(local, remote, id, value);
      if (!plan) { this.ports.notify('invalid'); continue; }
      if (plan.before === plan.after) { this.ports.notify('unchanged'); continue; }
      if (!await this.ports.confirm(plan) || !this.ports.active()) continue;
      let audit: 'accepted' | 'blocked' | 'cleanup-pending';
      try { audit = await this.ports.audit(plan, token, remote); }
      catch { this.ports.possibleMutation(); this.ports.notify('partial'); return 'partial'; }
      if (audit === 'cleanup-pending') { this.ports.possibleMutation(); return 'partial'; }
      if (audit !== 'accepted') { this.ports.notify('blocked'); token = undefined; remote = undefined; continue; }
      if (!this.ports.active()) return changed ? 'complete' : 'cancelled';
      let fresh: SetupRemoteConfiguration;
      try { fresh = await this.ports.inspectRemote(token); }
      catch { this.ports.notify('blocked'); continue; }
      if (!this.ports.active()) return changed ? 'complete' : 'cancelled';
      if (!this.ports.approvalCurrent() || managementFingerprint(this.ports.inspectLocal(), fresh, plan.variable) !== plan.fingerprint) {
        remote = fresh; this.ports.notify('stale'); continue;
      }
      this.ports.possibleMutation();
      try {
        const result = await this.ports.write(plan, token, fresh);
        remote = await this.ports.inspectRemote(token);
        const observed = buildSetupManagementView(this.ports.inspectLocal(), remote).settings.find(item => item.id === id);
        const success = result.errors.length === 0 && result.created + result.updated === 1
          && observed?.value === plan.after && observed.source === plan.scope;
        this.ports.recordWrite(success, plan.scope);
        if (!success) { this.ports.notify('partial'); return 'partial'; }
        changed = true;
        this.ports.notify('updated');
      } catch {
        this.ports.recordWrite(false, plan.scope);
        this.ports.notify('partial');
        return 'partial';
      }
    }
    return changed ? 'complete' : 'cancelled';
  }
}
