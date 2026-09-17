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
const SDD_PATH = /^specs\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.md$/;
const CAPABILITY_ID = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const SHA = /^[a-f0-9]{40}$/i;
const DIGEST = /^[a-f0-9]{64}$/i;

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
    throw new Error('The requested SDD update is not owned by the selected catalog capability.');
  }
  if (action === 'companion' && (!ownerPaths || registered)) {
    throw new Error('A companion SDD requires an existing owner and a new path.');
  }
  if (action === 'new' && (ownerPaths || registered)) {
    throw new Error('A new SDD requires an unregistered capability and path.');
  }
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
      && (typeof value.branchName !== 'string' || !value.branchName.trim()
        || typeof value.commitSha !== 'string' || !SHA.test(value.commitSha))) return undefined;
    if (value.revisionSha !== undefined && (typeof value.revisionSha !== 'string' || !SHA.test(value.revisionSha))) return undefined;
    if (value.revisionBaseSha !== undefined && (typeof value.revisionBaseSha !== 'string' || !SHA.test(value.revisionBaseSha))) return undefined;
    if (value.revisionSha && !value.revisionBaseSha) return undefined;
    if (value.answers !== undefined && (!Array.isArray(value.answers) || value.answers.length > 24
      || value.answers.some((answer: unknown) => !isRecord(answer)
        || !/^Q[1-8]$/.test(String(answer.questionId))
        || typeof answer.author !== 'string' || answer.author.length > 100
        || !Number.isInteger(answer.commentId) || (answer.commentId as number) <= 0
        || typeof answer.text !== 'string' || answer.text.length > 3000))) return undefined;
    return value as unknown as SddGateRecord;
  } catch {
    return undefined;
  }
}

export function renderSddGateRecord(record: SddGateRecord): string {
  const marker = `<!-- ${SDD_GATE_MARKER}\n${JSON.stringify(record)}\n-->`;
  if (record.phase === 'published') {
    return `## SDD work status\n\n**Current status:** The SDD is published; implementation can begin after branch verification.\n\n**SDD:** \`${record.plan.path}\` · **Branch:** \`${record.branchName}\` · **First commit:** \`${record.commitSha}\`${record.revisionSha ? ` · **Revision:** \`${record.revisionSha}\`` : ''}\n\n${marker}`;
  }
  const questions = record.plan.questions.map(question =>
    `- **${question.id} · ${question.owner === 'maintainer' ? 'Maintainer' : 'Issue author'}:** ${sanitize(question.text)}${question.suggestion ? `\n  Suggested answer: ${sanitize(question.suggestion)}` : ''}`,
  ).join('\n');
  const retained = record.branchName
    ? `The linked branch \`${record.branchName}\` and its first SDD commit are retained; implementation waits for this revision.`
    : 'No SDD draft or branch exists yet.';
  return `## SDD work status\n\n**Current status:** Waiting for specification answers. ${retained}\n\n**Owning SDD:** \`${record.plan.path}\`\n\n${questions}\n\nReply with \`SDD Q1: your answer\` (one line per question). The Action will continue after the required people answer every question.\n\n${marker}`;
}

export function parseSddAnswer(body: string, questionId: string): string | undefined {
  const line = body.split(/\r?\n/).find(candidate => new RegExp(`^\\s*SDD\\s+${questionId}:\\s*`, 'i').test(candidate));
  if (!line) return undefined;
  const text = line.replace(new RegExp(`^\\s*SDD\\s+${questionId}:\\s*`, 'i'), '').trim();
  return text.length >= 3 && text.length <= 3000 ? text : undefined;
}

export function validateSddMarkdown(markdown: string): void {
  if (markdown.length < 1800 || markdown.length > 70_000) throw new Error('The SDD draft length is outside the supported range.');
  for (const heading of ['## 1. Executive summary', '## 4. Goals', '## 8. Clean Architecture', '## 14. Testing strategy', '## 16. Acceptance']) {
    if (!markdown.includes(heading)) throw new Error(`The SDD draft is missing ${heading}.`);
  }
  if (!/\b\d+\s+(?:distinct\s+)?(?:cases|tests|casos|pruebas)\b/i.test(markdown)) {
    throw new Error('The SDD must include a numeric test budget.');
  }
}

function sanitize(value: string): string {
  return value.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, ' ').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
