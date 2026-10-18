import type { SetupBatchCandidate } from '../../../domain/setup_batch';
import type { SetupBatchDiscoveryPort } from '../../ports/setup_batch_ports';
import type { SetupBatchSelectionView } from '../../contracts/setup_batch_view';
import { parseSetupBatchSelectionIntent } from '../../policies/setup_batch_selection_policy';
import { SetupInteractionCancelledError } from '../../errors/setup_interaction_cancelled_error';

export interface SelectSetupBatchTargetsPorts {
  readonly discovery: SetupBatchDiscoveryPort;
  choose(view: SetupBatchSelectionView): Promise<string | undefined>;
  requestToken(repositories: readonly string[]): Promise<string | undefined>;
  active(): boolean;
}
/** Limited discovery is a convenience view. Only explicit, re-resolved IDs become targets. */
export class SelectSetupBatchTargetsUseCase {
  constructor(private readonly ports: SelectSetupBatchTargetsPorts) {}
  async execute(request: { readonly organization: string; readonly currentRepository: string; readonly token: string }): Promise<{
    readonly token: string; readonly selected: readonly { readonly id: number; readonly name: string }[] }> {
    let token = request.token;
    const current = await this.ports.discovery.resolve(request.organization, request.currentRepository, token);
    const ownerId = current.ownerId;
    let candidates: readonly SetupBatchCandidate[] = [current];
    let discoveryStatus: SetupBatchSelectionView['discoveryStatus'] = 'available';
    let truncated = false;
    const unavailable = new Set<number>();
    let selectedIds: readonly number[] = current.canPush && !current.archived && !current.disabled ? [current.id] : [];
    let message: SetupBatchSelectionView['message'];
    const refresh = async (): Promise<void> => {
      try {
        const result = await this.ports.discovery.list(request.organization, token);
        if (result.targets.some(target => target.ownerId !== ownerId || target.owner.toLowerCase() !== request.organization.toLowerCase())
          || new Set(result.targets.map(target => target.id)).size !== result.targets.length
          || new Set(result.targets.map(target => target.name.toLowerCase())).size !== result.targets.length) throw new Error('Ambiguous discovery identity.');
        const byId = new Map(result.targets.map(target => [target.id, target]));
        result.targets.forEach(target => unavailable.delete(target.id));
        for (const target of candidates.filter(target => selectedIds.includes(target.id) || target.id === current.id)) {
          try {
            const fresh = await this.ports.discovery.resolve(request.organization, target.name, token);
            if (fresh.id !== target.id || fresh.ownerId !== ownerId) throw new Error('Changed target identity.');
            byId.set(fresh.id, fresh); unavailable.delete(fresh.id);
          } catch { byId.set(target.id, target); unavailable.add(target.id); }
        }
        candidates = [...byId.values()]; discoveryStatus = 'available'; truncated = result.truncated;
      } catch { discoveryStatus = 'unavailable'; }
    };
    await refresh();
    for (;;) {
      if (!this.ports.active()) throw new SetupInteractionCancelledError();
      const view: SetupBatchSelectionView = { organization: request.organization, currentRepositoryId: current.id,
        selectedIds, discoveryStatus, truncated, message, candidates: candidates.map(candidate => ({ id: candidate.id,
          name: candidate.name, private: candidate.private, ...(unavailable.has(candidate.id) ? { unavailable: 'access-unavailable' as const }
            : candidate.archived ? { unavailable: 'archived' as const } : candidate.disabled ? { unavailable: 'disabled' as const }
              : !candidate.canPush ? { unavailable: 'read-only' as const } : {}) })) };
      const answer = await this.ports.choose(view);
      if (answer === undefined || !this.ports.active()) throw new SetupInteractionCancelledError();
      const intent = parseSetupBatchSelectionIntent(answer, view);
      if (!intent) { message = 'selection-invalid'; continue; }
      selectedIds = intent.selectedIds; message = undefined;
      if (intent.action === 'select') {
        return { token, selected: selectedIds.map(id => ({ id, name: candidates.find(candidate => candidate.id === id)!.name })) };
      }
      if (intent.action === 'resolve') {
        try {
          const target = await this.ports.discovery.resolve(request.organization, intent.name, token);
          if (target.ownerId !== ownerId) throw new Error('Organization identity changed.');
          candidates = [target, ...candidates.filter(candidate => candidate.id !== target.id && candidate.name.toLowerCase() !== target.name.toLowerCase())];
          unavailable.delete(target.id);
        } catch { message = 'lookup-unavailable'; }
      } else {
        const replacement = await this.ports.requestToken(selectedIds.map(id => candidates.find(candidate => candidate.id === id)!.name));
        if (replacement) {
          token = replacement;
          candidates.forEach(candidate => unavailable.add(candidate.id));
          await refresh();
        }
        else message = 'access-unavailable';
      }
    }
  }
}
