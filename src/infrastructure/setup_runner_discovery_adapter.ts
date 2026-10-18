import type { SetupRunnerDiscoveryPort } from '../application/ports/setup_runner_ports';
import type { SetupOwnerType } from '../domain/setup';
import type { SetupRunnerCandidate, SetupRunnerInventory } from '../domain/setup_runner';
import { SetupBatchGithubTransport } from './setup_batch_github_read_adapter';

const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : undefined;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 100 && !/[\p{Cc}\p{Cf}${}<>]/u.test(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

/** Fixed GET routes only. Discovery never registers runners, grants access or schedules jobs. */
export class SetupRunnerDiscoveryAdapter implements SetupRunnerDiscoveryPort {
  constructor(private readonly transport: SetupBatchGithubTransport) {}

  async discover(owner: string, repository: string, token: string, ownerType: SetupOwnerType): Promise<SetupRunnerInventory> {
    const candidates: SetupRunnerCandidate[] = [];
    const groups: { name: string; access: 'confirmed' | 'unknown' }[] = [];
    let incomplete = false;
    try {
      const local = await this.collection(token, 'GET /repos/{owner}/{repo}/actions/runners', { owner, repo: repository }, 'runners');
      candidates.push(...local.map(value => this.runner(value, 'confirmed')));
    } catch { incomplete = true; }
    if (ownerType === 'Organization') {
      try {
        const eligible = await this.collection(token, 'GET /orgs/{org}/actions/runner-groups',
          { org: owner, visible_to_repository: repository }, 'runner_groups');
        // A single operation never fans out over an unbounded group inventory.
        if (eligible.length > 10) throw new Error('Runner group discovery exceeds its bounded fan-out.');
        for (const value of eligible) {
          const group = record(value);
          if (!positive(group?.id) || !text(group?.name) || typeof group?.restricted_to_workflows !== 'boolean'
            || groups.some(existing => existing.name === group.name)) throw new Error('Invalid runner group inventory.');
          const access = group.restricted_to_workflows ? 'unknown' as const : 'confirmed' as const;
          groups.push({ name: group.name, access });
          if (candidates.length === 1_000) { incomplete = true; break; }
          try {
            const runners = await this.collection(token, 'GET /orgs/{org}/actions/runner-groups/{runner_group_id}/runners',
              { org: owner, runner_group_id: group.id }, 'runners', 1_000 - candidates.length);
            candidates.push(...runners.map(value => ({ ...this.runner(value, access), group: group.name as string })));
          } catch { incomplete = true; }
        }
      } catch { incomplete = true; }
    } else if (ownerType === 'Unknown') incomplete = true;
    return { status: incomplete ? candidates.length || groups.length ? 'incomplete' : 'unavailable' : 'available',
      candidates, groups };
  }

  private runner(value: unknown, access: SetupRunnerCandidate['access']): SetupRunnerCandidate {
    const runner = record(value);
    if (!positive(runner?.id) || !['online', 'offline'].includes(String(runner?.status)) || typeof runner?.busy !== 'boolean'
      || !Array.isArray(runner?.labels) || runner.labels.length < 1 || runner.labels.length > 100) throw new Error('Invalid runner inventory.');
    const labels = runner.labels.map(label => record(label)?.name);
    if (!labels.every(text) || new Set(labels.map(label => label.toLowerCase())).size !== labels.length) throw new Error('Invalid runner labels.');
    return { id: runner.id, labels, status: runner.status as 'online' | 'offline', busy: runner.busy, access };
  }

  private async collection(token: string, route: string, parameters: Record<string, unknown>, field: string, limit = 1_000): Promise<readonly unknown[]> {
    const result: unknown[] = []; const ids = new Set<number>(); let total: number | undefined;
    // Stable total <= 1,000 and full 100-entry intermediate pages bound this
    // loop to ten requests; every partial/oversized page fails closed below.
    for (let page = 1; ; page++) {
      const response = record(await this.transport.call(token, route, { ...parameters, per_page: 100, page }));
      const count = response?.total_count; const entries = response?.[field];
      if (!Number.isSafeInteger(count) || Number(count) < 0 || Number(count) > limit || !Array.isArray(entries)
        || entries.length > 100 || total !== undefined && count !== total) throw new Error('Incomplete runner discovery.');
      total = Number(count);
      for (const entry of entries) {
        const itemId = record(entry)?.id;
        if (!positive(itemId) || ids.has(itemId)) throw new Error('Invalid runner discovery identity.');
        ids.add(itemId); result.push(entry);
      }
      if (result.length === total) return result;
      if (entries.length !== 100 || result.length > total) throw new Error('Incomplete runner discovery.');
    }
  }
}
