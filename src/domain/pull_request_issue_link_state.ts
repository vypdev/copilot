export const MAX_PENDING_LINK_RECORD = 4096;
export const MAX_PENDING_LINK_BODY = 65_536;
const PREFIX = '<!-- copilot:pr-issue-link:';
const V2_KEYS = ['version', 'pullRequestNumber', 'issueNumber', 'originalBaseBranch',
  'operationId', 'headRepository', 'headRef', 'headSha'];

export interface LegacyPendingPullRequestLink {
  readonly version: 1;
  readonly pullRequestNumber: number;
  readonly issueNumber: number;
  readonly originalBaseBranch: string;
}
export interface PendingPullRequestLinkV2 extends Omit<LegacyPendingPullRequestLink, 'version'> {
  readonly version: 2;
  readonly operationId: string;
  readonly headRepository: string;
  readonly headRef: string;
  readonly headSha: string;
}
export type PendingPullRequestLink = LegacyPendingPullRequestLink | PendingPullRequestLinkV2;
type BlockReason = 'invalid' | 'ambiguous' | 'oversized' | 'ownership' | 'injected';
export type PendingPullRequestLinkState = { readonly kind: 'none' }
  | { readonly kind: 'blocked'; readonly reason: BlockReason }
  | { readonly kind: 'pending'; readonly record: PendingPullRequestLink; readonly marker: string;
      readonly start: number; readonly end: number };

export class PendingPullRequestLinkError extends Error {
  constructor(readonly reason: BlockReason) {
    super('Pending pull-request linkage state must be recovered before it can be changed.');
    this.name = 'PendingPullRequestLinkError';
  }
}

export function readPendingPullRequestLink(body: string): PendingPullRequestLinkState {
  if (typeof body !== 'string') return { kind: 'blocked', reason: 'invalid' };
  if (body.length > MAX_PENDING_LINK_BODY) return { kind: 'blocked', reason: 'oversized' };
  const position = body.indexOf(PREFIX);
  if (position < 0) return { kind: 'none' };
  if (body.indexOf(PREFIX, position + PREFIX.length) >= 0) return { kind: 'blocked', reason: 'ambiguous' };
  const close = body.indexOf('-->', position);
  if (close < 0) return { kind: 'blocked', reason: 'invalid' };
  const end = close + 3;
  const marker = body.slice(position, end);
  if (marker.length > MAX_PENDING_LINK_RECORD) return { kind: 'blocked', reason: 'oversized' };
  const record = parseMarker(marker);
  if (!record) return { kind: 'blocked', reason: 'invalid' };
  const reference = temporaryReference(record.issueNumber);
  const start = position - reference.length;
  if (start < 0 || body.slice(start, position) !== reference) return { kind: 'blocked', reason: 'invalid' };
  return { kind: 'pending', record, marker, start, end };
}

export function createPendingPullRequestLink(input: Omit<PendingPullRequestLinkV2, 'version'>): string {
  if (!isRecord(input) || Object.keys(input).length !== V2_KEYS.length - 1
    || Object.keys(input).some(key => key === 'version' || !V2_KEYS.includes(key))) {
    throw new PendingPullRequestLinkError('invalid');
  }
  const record = { version: 2, ...input };
  if (!isV2(record)) throw new PendingPullRequestLinkError('invalid');
  const marker = `${PREFIX}v2;data=${encodeURIComponent(JSON.stringify(record))};state=pending -->`;
  if (marker.length > MAX_PENDING_LINK_RECORD) throw new PendingPullRequestLinkError('oversized');
  return marker;
}

export function attachPendingPullRequestLink(body: string, marker: string): string {
  const existing = readPendingPullRequestLink(body);
  if (existing.kind !== 'none') throw new PendingPullRequestLinkError(existing.kind === 'blocked' ? existing.reason : 'ownership');
  const record = parseMarker(marker);
  if (!record || marker.length > MAX_PENDING_LINK_RECORD) throw new PendingPullRequestLinkError('invalid');
  const combined = `${body}${temporaryReference(record.issueNumber)}${marker}`;
  if (combined.length > MAX_PENDING_LINK_BODY) throw new PendingPullRequestLinkError('oversized');
  return combined;
}

/** Remove only this operation's bytes, retaining concurrent prose/configuration. */
export function removePendingPullRequestLink(body: string, marker: string): string {
  const state = readPendingPullRequestLink(body);
  if (state.kind !== 'pending' || state.marker !== marker) throw new PendingPullRequestLinkError('ownership');
  return body.slice(0, state.start) + body.slice(state.end);
}

/** Model-owned prose never creates, replaces or discards host-owned recovery state. */
export function preservePendingPullRequestLink(current: string, rendered: string): string {
  const original = readPendingPullRequestLink(current);
  if (original.kind === 'blocked') throw new PendingPullRequestLinkError(original.reason);
  const candidate = readPendingPullRequestLink(rendered);
  if (candidate.kind === 'blocked') throw new PendingPullRequestLinkError('injected');
  if (original.kind === 'none') {
    if (candidate.kind !== 'none') throw new PendingPullRequestLinkError('injected');
    return rendered;
  }
  const prose = candidate.kind === 'pending'
    ? removePendingPullRequestLink(rendered, original.marker)
    : rendered;
  return attachPendingPullRequestLink(prose, original.marker);
}

export function pendingPullRequestParent(body: string, pullRequestNumber: number, issueNumber: number): string | undefined {
  const state = readPendingPullRequestLink(body);
  if (state.kind === 'none') return undefined;
  if (state.kind === 'blocked') throw new PendingPullRequestLinkError(state.reason);
  if (state.record.pullRequestNumber !== pullRequestNumber || state.record.issueNumber !== issueNumber) {
    throw new PendingPullRequestLinkError('ownership');
  }
  return state.record.originalBaseBranch;
}

function parseMarker(marker: string): PendingPullRequestLink | undefined {
  try {
    const legacy = /^<!-- copilot:pr-issue-link:v1;pr=([0-9]+);issue=([0-9]+);base=([^;]*);state=pending -->$/.exec(marker);
    if (legacy) {
      const record = { version: 1 as const, pullRequestNumber: Number(legacy[1]), issueNumber: Number(legacy[2]),
        originalBaseBranch: decodeURIComponent(legacy[3]) };
      return validBaseRecord(record) ? Object.freeze(record) : undefined;
    }
    const current = /^<!-- copilot:pr-issue-link:v2;data=([^;]+);state=pending -->$/.exec(marker);
    if (!current) return undefined;
    const record: unknown = JSON.parse(decodeURIComponent(current[1]));
    return isV2(record) ? Object.freeze(record) : undefined;
  } catch { return undefined; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function validBaseRecord(value: Record<string, unknown>): boolean {
  return positive(value.pullRequestNumber) && positive(value.issueNumber)
    && value.pullRequestNumber !== value.issueNumber && typeof value.originalBaseBranch === 'string'
    && safeRef(value.originalBaseBranch) && value.originalBaseBranch.length <= 100;
}
function isV2(value: unknown): value is PendingPullRequestLinkV2 {
  return isRecord(value) && Object.keys(value).length === V2_KEYS.length
    && Object.keys(value).every(key => V2_KEYS.includes(key)) && value.version === 2
    && validBaseRecord(value) && typeof value.operationId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.operationId)
    && typeof value.headRepository === 'string' && value.headRepository.length <= 512
    && /^[A-Za-z0-9][A-Za-z0-9_.-]*\/(?!\.{1,2}$)[A-Za-z0-9_.-]+$/.test(value.headRepository)
    && typeof value.headRef === 'string' && safeRef(value.headRef)
    && typeof value.headSha === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value.headSha);
}
function temporaryReference(issueNumber: number): string { return `\n\nResolves #${issueNumber}\n\n`; }

/** Authenticated native PR identity; a body marker is never mutation authority. */
export interface PullRequestLinkIdentity {
  readonly number: number;
  readonly state: 'open' | 'closed';
  readonly repository: string;
  readonly headRepository: string;
  readonly headRef: string;
  readonly headSha: string;
}
export function isOpenPullRequestLinkIdentity(value: PullRequestLinkIdentity | undefined, number: number): value is PullRequestLinkIdentity {
  return value !== undefined && value.number === number && value.state === 'open'
    && /^[A-Za-z0-9][A-Za-z0-9_.-]*\/(?!\.{1,2}$)[A-Za-z0-9_.-]+$/.test(value.repository)
    && /^[A-Za-z0-9][A-Za-z0-9_.-]*\/(?!\.{1,2}$)[A-Za-z0-9_.-]+$/.test(value.headRepository)
    && safeRef(value.headRef) && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value.headSha);
}

function safeRef(value: string): boolean {
  return value.length > 0 && value.length <= 1024 && value === value.trim()
    && value.split('/').every(component => component.length > 0 && !component.startsWith('.') && !component.endsWith('.lock'))
    && !value.startsWith('/') && !value.endsWith('/') && !value.includes('..') && !value.includes('@{')
    && !/[~^:?*[\\\]\s]/.test(value)
    && !Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) && !value.endsWith('.') && !value.endsWith('.lock');
}
