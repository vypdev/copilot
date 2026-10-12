import { isSafeSddPath } from '../../domain/pre_branch_sdd';
import type { SddStructuralDiff } from '../../domain/pre_branch_sdd_diff';
import type { SddDiffMessageCatalog, SddDiffMessageId } from './sdd_diff_message_catalog';

export interface SddDiffPublication { readonly path: string; readonly firstSha: string; readonly currentSha?: string }
export interface SddDiffCard { readonly issueNumber: number; readonly commentId: number }
export type SddDiffSnapshot = (
  | { readonly state: 'not-applicable' | 'no-publication' | 'invalid' | 'unavailable' | 'ambiguous' }
  | { readonly state: 'stale' | 'pending-revision'; readonly publication?: SddDiffPublication }
  | { readonly state: 'initial-only'; readonly publication: SddDiffPublication }
  | { readonly state: 'bounded'; readonly publication: SddDiffPublication; readonly reason: Extract<SddStructuralDiff, { state: 'bounded' }>['reason'] }
  | { readonly state: 'compared'; readonly publication: SddDiffPublication; readonly changes: Extract<SddStructuralDiff, { state: 'compared' }> }) & { readonly card?: SddDiffCard };
export interface SddDiffScope { readonly serverOrigin: string; readonly owner: string; readonly repository: string }
const STATES = ['not-applicable', 'no-publication', 'initial-only', 'stale', 'pending-revision', 'invalid', 'unavailable', 'ambiguous', 'bounded', 'compared'] as const;
const ACTIONS: Readonly<Record<SddDiffSnapshot['state'], SddDiffMessageId>> = Object.freeze({
  'not-applicable': 'sddDiff.none', 'no-publication': 'sddDiff.publish', 'initial-only': 'sddDiff.none',
  stale: 'sddDiff.refresh', 'pending-revision': 'sddDiff.answer', invalid: 'sddDiff.retry', unavailable: 'sddDiff.retry',
  ambiguous: 'sddDiff.choose', bounded: 'sddDiff.reduce', compared: 'sddDiff.none',
});
/** Immutable links are constructed only from a bound server/repository and verified publication facts. */
export function renderSddDiff(snapshot: SddDiffSnapshot, scope: SddDiffScope, catalog: SddDiffMessageCatalog): string {
  const render = catalog.message;
  const heading = `## ${render('sddDiff.heading')}`;
  const fallback = `${heading}\n\n${render('sddDiff.unavailable')}\n\n**${render('sddDiff.action')}:** ${render('sddDiff.retry')}`;
  const root = repositoryRoot(scope);
  if (!root || !STATES.includes(snapshot.state)) return fallback;
  const lines = [heading, '', `**${render('sddDiff.status')}:** ${render(`sddDiff.${snapshot.state}`)}`, '',
    `**${render('sddDiff.action')}:** ${render(ACTIONS[snapshot.state])}`];
  if ('publication' in snapshot && snapshot.publication) {
    const publication = snapshot.publication;
    if (!isSafeSddPath(publication.path) || !sha(publication.firstSha)) return fallback;
    const historical = snapshot.state === 'stale' || snapshot.state === 'pending-revision';
    if (historical) lines.push('', link('sddDiff.historical', publication.firstSha, publication.path));
    else {
      lines.push('', link('sddDiff.first', publication.firstSha, publication.path));
      if (snapshot.state !== 'initial-only') {
        if (!sha(publication.currentSha) || publication.currentSha === publication.firstSha) return fallback;
        lines.push(link('sddDiff.current', publication.currentSha!, publication.path));
      }
    }
  } else if (snapshot.state === 'initial-only' || snapshot.state === 'compared' || snapshot.state === 'bounded') return fallback;
  if (snapshot.card && (snapshot.state === 'stale' || snapshot.state === 'pending-revision')) {
    if (!positive(snapshot.card.issueNumber) || !positive(snapshot.card.commentId)) return fallback;
    lines.push('', `[${render('sddDiff.card')}](${root}/issues/${snapshot.card.issueNumber}#issuecomment-${snapshot.card.commentId})`);
  }
  if (snapshot.state === 'compared' || snapshot.state === 'bounded') {
    const publication = snapshot.publication;
    lines.push('', `[${render('sddDiff.compare')}](${root}/compare/${publication.firstSha}...${publication.currentSha})`);
  }
  if (snapshot.state === 'bounded') {
    if (!['characters', 'bytes', 'lines', 'work'].includes(snapshot.reason)) return fallback;
    lines.push('', render(`sddDiff.${snapshot.reason}Limit`));
  }
  if (snapshot.state === 'compared') {
    const changes = snapshot.changes;
    if (changes.state !== 'compared' || !count(changes.addedLines, 2000) || !count(changes.removedLines, 2000)
      || !count(changes.omittedSections, 4000) || !Array.isArray(changes.sections) || changes.sections.length > 8
      || changes.sections.some(title => typeof title !== 'string' || title.length > 120)) return fallback;
    lines.push('', render('sddDiff.lines', { added: changes.addedLines, removed: changes.removedLines }), '', render('sddDiff.structural'));
    if (changes.sections.length) lines.push('', `**${render('sddDiff.sections')}:**`, ...changes.sections.map(title => `- ${escapeTitle(title)}`));
    if (changes.omittedSections) lines.push('', render('sddDiff.omitted', { count: changes.omittedSections }));
  }
  const body = lines.join('\n');
  return body.length <= 5600 ? body : fallback;
  function link(label: 'sddDiff.first' | 'sddDiff.current' | 'sddDiff.historical', commit: string, path: string): string {
    return `[${render(label)} · ${commit.slice(0, 9)}](${root}/blob/${commit}/${path}) · [${render('sddDiff.commit')}](${root}/commit/${commit})`;
  }
}
function positive(value: unknown): boolean { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function count(value: unknown, max: number): boolean { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max; }
function sha(value: unknown): boolean { return typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value); }
function repositoryRoot(scope: SddDiffScope): string | undefined {
  if (scope.serverOrigin.length > 200 || ![scope.owner, scope.repository].every(value => /^[A-Za-z0-9_.-]{1,100}$/u.test(value) && !['.', '..'].includes(value))) return undefined;
  try {
    const url = new URL(scope.serverOrigin);
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
      ? `${url.origin}/${scope.owner}/${scope.repository}` : undefined;
  } catch { return undefined; }
}
function escapeTitle(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, ' ').replace(/@/gu, '@\u200b')
    .replace(/([\\`*_{}[\]()<>#|~!])/gu, '\\$1');
}
