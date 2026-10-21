/** Pure, bounded contracts for clarification before an Action-owned issue branch exists. */
export type SddOwnerAction = 'update' | 'companion' | 'new';
export type SddAnswerOwner = 'issue-author' | 'maintainer';

export interface SddQuestion {
  readonly id: string;
  readonly text: string;
  readonly owner: SddAnswerOwner;
  readonly suggestion?: string;
}

export interface SddPlan {
  readonly action: SddOwnerAction;
  readonly path: string;
  readonly capabilityId: string;
  readonly reason: string;
  readonly questions: readonly SddQuestion[];
}

export interface SddAnswer {
  readonly questionId: string;
  readonly author: string;
  readonly commentId: number;
  readonly text: string;
  /** Legacy records may lack question provenance; never infer it from reused Q IDs. */
  readonly round?: number;
  readonly questionText?: string;
}

export interface SddGateRecord {
  readonly version: 1;
  readonly issueNumber: number;
  readonly phase: 'awaiting-answer' | 'published';
  readonly issueDigest: string;
  readonly baseSha: string;
  readonly round: number;
  readonly plan: SddPlan;
  readonly answers?: readonly SddAnswer[];
  readonly branchName?: string;
  readonly commitSha?: string;
  readonly revisionSha?: string;
  readonly revisionBaseSha?: string;
}

export const SDD_GATE_MARKER = 'copilot:sdd-gate:v1';
export const SDD_MIN_DRAFT_CHARACTERS = 1800;
export const SDD_MAX_DRAFT_CHARACTERS = 70_000;
export const SDD_MAX_UPDATE_CHARACTERS = 18_000;

/** Prior answers are context only; the use case must independently satisfy the current questions. */
export function retainSddAnswers(previous: readonly SddAnswer[], current: readonly SddAnswer[]): readonly SddAnswer[] {
  const answers = [...previous, ...current];
  if (answers.length > 24 || serializeSddGateValue(answers).length > 64_000) {
    throw new Error('The retained SDD answer history exceeds its supported bound; use concise explicit answers.');
  }
  return Object.freeze(answers);
}
const SDD_PATH = /^specs\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.md$/;
const CAPABILITY_ID = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const SHA = /^[a-f0-9]{40}$/i;
const DIGEST = /^[a-f0-9]{64}$/i;
const BRANCH_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;

/** Ignores the emoji/version prefix written by the Action while tracking human title edits. */
export function normalizeSddIssueTitle(title: string): string {
  return title.trim()
    .replace(/^[^\p{L}\p{N}]*-\s*/u, '')
    .replace(/^\d+(?:\.\d+){2,}\s*-\s*/u, '')
    .trim();
}

export function isSafeSddPath(path: string): boolean {
  return SDD_PATH.test(path) && !['specs/CATALOG.md', 'specs/_template.md'].includes(path);
}

export type SddOwnershipFailureReason = 'update-owner-mismatch' | 'companion-owner-unknown'
  | 'companion-path-registered' | 'new-owner-registered' | 'new-path-registered';

/** Closed diagnostics contain no model-selected identifiers or provider text. */
export class SddOwnershipFailure extends Error {
  constructor(readonly reason: SddOwnershipFailureReason) {
    super(`SDD ownership analysis rejected (${reason}).`);
    this.name = 'SddOwnershipFailure';
  }
}

/** The agent may propose ownership but cannot invent a catalogued owner or arbitrary path. */
export function parseSddPlan(value: unknown, catalog: ReadonlyMap<string, readonly string[]>): SddPlan {
  if (!isRecord(value)) throw new Error('The SDD analysis must be an object.');
  const action = value.action;
  const path = value.path;
  const capabilityId = value.capabilityId;
  const reason = value.reason;
  if (!['update', 'companion', 'new'].includes(String(action))
    || typeof path !== 'string' || !isSafeSddPath(path)
    || typeof capabilityId !== 'string' || !CAPABILITY_ID.test(capabilityId)
    || typeof reason !== 'string' || reason.trim().length < 20 || reason.length > 1200) {
    throw new Error('The SDD analysis has an invalid owner, path, or reason.');
  }
  const ownerPaths = catalog.get(capabilityId);
  const registered = [...catalog.values()].some(paths => paths.includes(path));
  if (action === 'update' && (!ownerPaths?.includes(path) || !registered)) {
    throw new SddOwnershipFailure('update-owner-mismatch');
  }
  if (action === 'companion' && !ownerPaths) throw new SddOwnershipFailure('companion-owner-unknown');
  if (action === 'companion' && registered) throw new SddOwnershipFailure('companion-path-registered');
  if (action === 'new' && ownerPaths) throw new SddOwnershipFailure('new-owner-registered');
  if (action === 'new' && registered) throw new SddOwnershipFailure('new-path-registered');
  if (!Array.isArray(value.questions) || value.questions.length > 8) {
    throw new Error('The SDD analysis must contain at most eight blocking questions.');
  }
  const questions = value.questions.map((question, index) => {
    if (!isRecord(question)
      || question.id !== `Q${index + 1}`
      || typeof question.text !== 'string' || question.text.trim().length < 12 || question.text.length > 1000
      || !['issue-author', 'maintainer'].includes(String(question.owner))
      || (question.suggestion != null && (typeof question.suggestion !== 'string' || question.suggestion.length > 500))) {
      throw new Error(`Invalid blocking SDD question Q${index + 1}.`);
    }
    return Object.freeze({
      id: question.id as string,
      text: question.text as string,
      owner: question.owner as SddAnswerOwner,
      ...(typeof question.suggestion === 'string' ? { suggestion: question.suggestion } : {}),
    });
  });
  return Object.freeze({ action: action as SddOwnerAction, path, capabilityId, reason, questions: Object.freeze(questions) });
}

export function readSddGateRecord(body: string | null | undefined, issueNumber: number): SddGateRecord | undefined {
  if (!body || body.length > 100_000) return undefined;
  const match = body.match(/<!-- copilot:sdd-gate:v1\n([^\n]+)\n-->/);
  if (!match) return undefined;
  try {
    const value: unknown = JSON.parse(match[1]);
    if (!isRecord(value) || value.version !== 1 || value.issueNumber !== issueNumber
      || !['awaiting-answer', 'published'].includes(String(value.phase))
      || typeof value.issueDigest !== 'string' || !DIGEST.test(value.issueDigest)
      || typeof value.baseSha !== 'string' || !SHA.test(value.baseSha)
      || !Number.isInteger(value.round) || (value.round as number) < 1 || (value.round as number) > 3
      || !isRecord(value.plan)) return undefined;
    try {
      const owner = new Map([[String(value.plan.capabilityId), [value.plan.action === 'companion' ? 'specs/existing-owner.md' : String(value.plan.path)]]]);
      parseSddPlan(value.plan, value.plan.action === 'new' ? new Map() : owner);
    } catch {
      return undefined;
    }
    if (value.phase === 'published'
      && (typeof value.branchName !== 'string' || typeof value.commitSha !== 'string' || !SHA.test(value.commitSha))) return undefined;
    if ((value.branchName !== undefined || value.commitSha !== undefined)
      && (typeof value.branchName !== 'string' || !BRANCH_NAME.test(value.branchName)
        || value.branchName.includes('..') || value.branchName.includes('//') || value.branchName.endsWith('.lock')
        || (value.commitSha !== undefined && (typeof value.commitSha !== 'string' || !SHA.test(value.commitSha))))) return undefined;
    if (value.revisionSha !== undefined && (typeof value.revisionSha !== 'string' || !SHA.test(value.revisionSha))) return undefined;
    if (value.revisionBaseSha !== undefined && (typeof value.revisionBaseSha !== 'string' || !SHA.test(value.revisionBaseSha))) return undefined;
    if (value.revisionSha && !value.revisionBaseSha) return undefined;
    if ((value.revisionSha || value.revisionBaseSha) && !value.commitSha) return undefined;
    if (value.answers !== undefined && (!Array.isArray(value.answers) || value.answers.length > 24
      || value.answers.some((answer: unknown) => !isRecord(answer)
        || !/^Q[1-8]$/.test(String(answer.questionId))
        || typeof answer.author !== 'string' || answer.author.length > 100
        || !Number.isInteger(answer.commentId) || (answer.commentId as number) <= 0
        || typeof answer.text !== 'string' || answer.text.length > 3000
        || ((answer.round !== undefined || answer.questionText !== undefined)
          && (!Number.isInteger(answer.round) || (answer.round as number) < 1 || (answer.round as number) > 3
            || typeof answer.questionText !== 'string' || answer.questionText.length < 12 || answer.questionText.length > 1000))))) return undefined;
    return value as unknown as SddGateRecord;
  } catch {
    return undefined;
  }
}

export function renderSddGateRecord(record: SddGateRecord, locale = 'en-US', issueUrl?: string): string {
  const spanish = /^es(?:-|$)/i.test(locale);
  const marker = `<!-- ${SDD_GATE_MARKER}\n${serializeSddGateValue(record)}\n-->`;
  if (record.phase === 'published') {
    const links = sddPublicationLinks(record, issueUrl, spanish);
    return spanish
      ? `## Estado del SDD\n\n**Estado actual:** El SDD está publicado; la implementación puede empezar tras verificar la rama.\n\n**SDD:** \`${record.plan.path}\` · **Rama:** \`${record.branchName}\` · **Primer commit:** \`${record.commitSha}\`${record.revisionSha ? ` · **Revisión:** \`${record.revisionSha}\`` : ''}${links}\n\n${marker}`
      : `## SDD work status\n\n**Current status:** The SDD is published; implementation can begin after branch verification.\n\n**SDD:** \`${record.plan.path}\` · **Branch:** \`${record.branchName}\` · **First commit:** \`${record.commitSha}\`${record.revisionSha ? ` · **Revision:** \`${record.revisionSha}\`` : ''}${links}\n\n${marker}`;
  }
  const questions = record.plan.questions.map(question =>
    `- **${question.id} · ${question.owner === 'maintainer' ? (spanish ? 'Mantenimiento' : 'Maintainer') : (spanish ? 'Autor de la issue' : 'Issue author')}:** ${sanitize(question.text)}${question.suggestion ? `\n  ${spanish ? 'Respuesta sugerida' : 'Suggested answer'}: ${sanitize(question.suggestion)}` : ''}`,
  ).join('\n');
  const retained = record.branchName && !record.commitSha
    ? spanish
      ? `Se conserva la rama vinculada \`${record.branchName}\`; la publicación del primer commit del SDD está pendiente. La implementación sigue bloqueada.`
      : `The linked branch \`${record.branchName}\` is retained; its first SDD commit is pending. Implementation remains blocked.`
    : record.branchName
    ? spanish
      ? `Se conservan la rama vinculada \`${record.branchName}\` y el primer commit del SDD; la implementación espera esta revisión.`
      : `The linked branch \`${record.branchName}\` and its first SDD commit are retained; implementation waits for this revision.`
    : spanish ? 'Todavía no existe ningún borrador del SDD ni ninguna rama.' : 'No SDD draft or branch exists yet.';
  const pendingPublication = Boolean(record.branchName && !record.commitSha && record.plan.questions.length === 0);
  const nextStep = pendingPublication
    ? spanish ? 'Vuelve a ejecutar el workflow de la issue para reintentar la publicación en esta misma rama.' : 'Run the issue workflow again to retry publication on this same branch.'
    : spanish ? 'Responde con `SDD Q1: tu respuesta` (una línea por pregunta). La Action continuará cuando las personas indicadas respondan todas las preguntas.' : 'Reply with `SDD Q1: your answer` (one line per question). The Action will continue after the required people answer every question.';
  return spanish
    ? `## Estado del SDD\n\n**Estado actual:** ${pendingPublication ? 'La publicación del primer SDD está pendiente.' : 'A la espera de respuestas para la especificación.'} ${retained}\n\n**SDD responsable:** \`${record.plan.path}\`\n\n**Ronda de aclaración:** ${record.round}\n\n${questions}\n\n${nextStep}\n\n${marker}`
    : `## SDD work status\n\n**Current status:** ${pendingPublication ? 'First SDD publication is pending.' : 'Waiting for specification answers.'} ${retained}\n\n**Owning SDD:** \`${record.plan.path}\`\n\n**Clarification round:** ${record.round}\n\n${questions}\n\n${nextStep}\n\n${marker}`;
}

function sddPublicationLinks(record: SddGateRecord, issueUrl: string | undefined, spanish: boolean): string {
  if (!issueUrl || !record.branchName || !record.commitSha) return '';
  try {
    const url = new URL(issueUrl);
    const match = url.pathname.match(/^\/(?:[^/]+)\/(?:[^/]+)\/issues\/(\d+)$/);
    if (url.protocol !== 'https:' || !match || Number(match[1]) !== record.issueNumber) return '';
    const repository = `${url.origin}${url.pathname.slice(0, url.pathname.lastIndexOf('/issues/'))}`;
    const commit = record.revisionSha ?? record.commitSha;
    return spanish
      ? `\n\n**Enlaces:** [SDD](${repository}/blob/${commit}/${record.plan.path}) · [Rama](${repository}/tree/${record.branchName}) · [Commit](${repository}/commit/${commit})`
      : `\n\n**Links:** [SDD](${repository}/blob/${commit}/${record.plan.path}) · [Branch](${repository}/tree/${record.branchName}) · [Commit](${repository}/commit/${commit})`;
  } catch {
    return '';
  }
}

export function isSddAnswerComment(body: string): boolean {
  return /^\s*SDD\s+Q[1-8]:/im.test(body);
}

export function parseSddAnswer(body: string, questionId: string): string | undefined {
  const line = body.split(/\r?\n/).find(candidate => new RegExp(`^\\s*SDD\\s+${questionId}:\\s*`, 'i').test(candidate));
  if (!line) return undefined;
  const text = line.replace(new RegExp(`^\\s*SDD\\s+${questionId}:\\s*`, 'i'), '').trim();
  return text.length >= 3 && text.length <= 3000 ? text : undefined;
}

/** Only these content failures may trigger a bounded draft regeneration. */
export class SddDraftFormatFailure extends Error {
  constructor(readonly reason: 'required-heading' | 'test-budget' | 'case-identity' | 'case-budget' | 'requirement-mapping' | 'repository-path', message: string) { super(message); }
}

/** An immutable owner cannot be repaired by regenerating its proposed appendix. */
export class SddOwnerFormatFailure extends Error {
  constructor(readonly reason: SddDraftFormatFailure['reason']) {
    super(`The existing owning SDD violates its ${reason} contract; review the owner before retrying.`);
  }
}

export const SDD_REQUIRED_HEADINGS = Object.freeze([
  '## 1. Executive summary', '## 4. Goals', '## 8. Clean Architecture', '## 14. Testing strategy', '## 16. Acceptance',
]);

export function validateSddMarkdown(markdown: string): void {
  if (markdown.length < SDD_MIN_DRAFT_CHARACTERS || markdown.length > SDD_MAX_DRAFT_CHARACTERS) throw new Error('The SDD draft length is outside the supported range.');
  for (const heading of SDD_REQUIRED_HEADINGS) {
    if (!markdown.includes(heading)) throw new SddDraftFormatFailure('required-heading', `The SDD draft is missing ${heading}.`);
  }
  if (!/\b[1-9]\d*\s+(?:distinct\s+)?(?:cases|tests|casos|pruebas)\b/i.test(markdown)
    && !hasNumericSddBudgetTable(markdown)) {
    throw new SddDraftFormatFailure('test-budget', 'The SDD must include a numeric test budget.');
  }
}

/** Accept the canonical template table only when its allocations prove its total. */
function hasNumericSddBudgetTable(markdown: string): boolean {
  let fence: string | undefined;
  let testing = false;
  let table = false;
  let separator = false;
  let sum = 0;
  let allocations = 0;
  let total: number | undefined;
  const finish = () => table && separator && allocations > 0 && total === sum;
  for (const line of markdown.split(/\r?\n/)) {
    const boundary = line.match(/^\s*(`{3,}|~{3,})/);
    if (boundary) {
      if (!fence) fence = boundary[1];
      else if (boundary[1][0] === fence[0] && boundary[1].length >= fence.length) fence = undefined;
      continue;
    }
    if (fence) continue;
    if (/^##\s/.test(line)) {
      if (testing) return finish();
      testing = /^## 14\. Testing strategy\b/.test(line);
      continue;
    }
    if (!testing) continue;
    if (!/^\s*\|/.test(line)) {
      if (table) return finish();
      continue;
    }
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.replace(/[*_`]/g, '').trim());
    if (!table) {
      if (!/^(?:area|área)$/i.test(cells[0] ?? '')
        || !/^(?:minimum(?: distinct)? (?:cases|tests)|(?:casos|pruebas) mínim[oa]s)$/i.test(cells[1] ?? '')) continue;
      table = true;
      continue;
    }
    if (!separator) {
      if (cells.length < 2 || !cells.every(cell => /^:?-{3,}:?$/.test(cell))) return false;
      separator = true;
      continue;
    }
    if (!cells[0] || !/^[1-9]\d*$/.test(cells[1] ?? '')) return false;
    const count = Number(cells[1]);
    if (!Number.isSafeInteger(count)) return false;
    if (/^total$/i.test(cells[0])) {
      if (total !== undefined) return false;
      total = count;
    } else {
      if (total !== undefined || !Number.isSafeInteger(sum + count)) return false;
      sum += count;
      allocations++;
    }
  }
  return finish();
}

/** Automated extensions retain the owning contract verbatim; contributors integrate revisions explicitly. */
export function composeSddUpdate(existing: string, change: string): string {
  try { validateSddMarkdown(existing); }
  catch (error) {
    if (error instanceof SddDraftFormatFailure) throw new SddOwnerFormatFailure(error.reason);
    throw error;
  }
  validateSddMarkdown(change);
  if (change.length > SDD_MAX_UPDATE_CHARACTERS) throw new Error('An SDD update appendix exceeds 18000 characters; use a proportional change or a companion SDD.');
  const appendix = shiftSddHeadings(change, 1);
  const merged = `${existing.trimEnd()}\n\n${appendix.trim()}\n`;
  validateSddMarkdown(merged);
  return merged;
}

/** Recovery validates the original candidate, not a second copy of its retained baseline. */
export function recoverSddUpdate(existing: string, published: string): string | undefined {
  const prefix = `${existing.trimEnd()}\n\n`;
  if (!published.startsWith(prefix)) return undefined;
  const change = shiftSddHeadings(published.slice(prefix.length), -1);
  return composeSddUpdate(existing, change) === published ? change : undefined;
}

function shiftSddHeadings(source: string, direction: 1 | -1): string {
  let fence: string | undefined;
  return source.split('\n').map(line => {
    const boundary = line.match(/^\s*(`{3,}|~{3,})/);
    if (boundary) {
      if (!fence) fence = boundary[1];
      else if (boundary[1][0] === fence[0] && boundary[1].length >= fence.length) fence = undefined;
      return line;
    }
    if (fence) return line;
    return direction === 1 ? (/^#{1,5} /.test(line) ? `#${line}` : line)
      : (/^#{2,6} /.test(line) ? line.slice(1) : line);
  }).join('\n');
}

function serializeSddGateValue(value: SddGateRecord | readonly SddAnswer[]): string {
  // Human answer text must never terminate its hidden state comment.
  return JSON.stringify(value).replace(/</gu, '\\u003c').replace(/>/gu, '\\u003e');
}

function sanitize(value: string): string {
  return value.replace(/\r?\n/g, ' ').trim()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\`*_[\]()#!])/g, '\\$1')
    .replace(/@/g, '@\u200B');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
