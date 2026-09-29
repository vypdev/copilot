import * as github from '@actions/github';
import type { SetupProjectDiscoveryPort } from '../application/ports/setup_project_discovery_port';
import type { SetupDiscoveryResult, SetupProjectCandidate } from '../domain/setup_questionnaire';

interface ProjectRow { number?: number; title?: string; state?: string; closed_at?: string | null }
interface FieldRow { name?: string; data_type?: string; options?: { name?: { raw?: string } | string }[] }

/** Bounded, read-only organization Project inventory; personal fine-grained PATs cannot use GitHub's user REST listing. */
export class GithubSetupProjectDiscoveryAdapter implements SetupProjectDiscoveryPort {
  async discover(owner: string, ownerType: 'Organization' | 'User' | 'Unknown', token: string): Promise<SetupDiscoveryResult<SetupProjectCandidate>> {
    if (ownerType === 'User') return { status: 'unsupported', candidates: [] };
    if (ownerType !== 'Organization') return { status: 'unavailable', candidates: [] };
    const octokit = github.getOctokit(token);
    const candidates: SetupProjectCandidate[] = [];
    let nextPage: { after: string } | { page: number } | undefined;
    let truncated = false;
    try {
      for (let page = 0; page < 2; page += 1) {
        const response = await octokit.request('GET /orgs/{org}/projectsV2', {
          org: owner, per_page: 50, ...(nextPage ?? {}),
        });
        for (const row of response.data as ProjectRow[]) {
          if (!Number.isSafeInteger(row.number) || Number(row.number) < 1 || row.state === 'closed' || row.closed_at != null
            || typeof row.title !== 'string' || !safeDisplayText(row.title)) continue;
          const number = Number(row.number);
          candidates.push({ number, title: row.title!, owner,
            url: `https://github.com/orgs/${encodeURIComponent(owner)}/projects/${number}` });
        }
        nextPage = nextPagination(response.headers.link);
        if (!nextPage) break;
        if (candidates.length >= 30) { truncated = true; break; }
        if (page === 1) truncated = true;
      }
    } catch (error) {
      return { status: discoveryFailure(error), candidates: [] };
    }
    const unique = [...new Map(candidates.map(candidate => [candidate.number, candidate])).values()];
    if (unique.length > 30) truncated = true;
    const inspected = await Promise.all(unique.slice(0, 30).map(async candidate => {
      try {
        const response = await octokit.request('GET /orgs/{org}/projectsV2/{project_number}/fields', {
          org: owner, project_number: candidate.number, per_page: 100,
        });
        if (nextPagination(response.headers.link)) return candidate;
        const status = (response.data as FieldRow[]).find(field => field.name === 'Status' && field.data_type === 'single_select');
        const options = status?.options?.map(option => typeof option.name === 'string' ? option.name : option.name?.raw)
          .filter((name): name is string => typeof name === 'string' && safeDisplayText(name));
        return options?.length ? { ...candidate, statusOptions: [...new Set(options)] } : candidate;
      } catch {
        return candidate;
      }
    }));
    return { status: inspected.length ? 'observed' : 'empty', candidates: inspected, ...(truncated ? { truncated: true } : {}) };
  }
}

function nextPagination(link: unknown): { after: string } | { page: number } | undefined {
  if (typeof link !== 'string') return undefined;
  const next = link.split(',').find(part => /;\s*rel="next"/u.test(part));
  const urlText = next?.match(/<([^>]+)>/u)?.[1];
  if (!urlText) return undefined;
  try {
    const url = new URL(urlText);
    if (url.protocol !== 'https:' || url.hostname !== 'api.github.com' || url.username || url.password) return undefined;
    const cursor = url.searchParams.get('after');
    if (cursor) return cursor.length <= 200 ? { after: cursor } : undefined;
    const page = url.searchParams.get('page');
    return page && /^[1-9]\d{0,5}$/u.test(page) ? { page: Number(page) } : undefined;
  } catch { return undefined; }
}

function safeDisplayText(value: string): boolean {
  return value.trim() === value && value.length > 0 && value.length <= 120 && !/[\p{Cc}\p{Cf}<>]/u.test(value);
}

function discoveryFailure(error: unknown): 'permission-denied' | 'unavailable' {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : undefined;
  return status === 401 || status === 403 ? 'permission-denied' : 'unavailable';
}
