import { createHash } from 'node:crypto';
import { ApplicationError } from '../errors/application_error';
import type { SddGateRecord, SddPlan, SddSelection } from '../../domain/pre_branch_sdd';
import type { SddCatalogCapability } from '../../domain/sdd_catalog_compatibility';

const SHA256 = '[a-f0-9]{64}';
const start = '<!-- copilot:sdd-seed -->';
const end = '<!-- /copilot:sdd-seed -->';

export function readSddSeed(body: string): { scope: string; seed?: string; hash?: string } {
  const normalized = body.replace(/\r\n/gu, '\n');
  const lines = normalized.split('\n');
  const open = lines.indexOf(start), close = lines.indexOf(end);
  const markers = [...normalized.matchAll(/<!--\s*\/?copilot:sdd-seed\b/giu)].length;
  if (markers === 0) return { scope: body };
  if (markers !== 2 || open < 0 || close <= open + 1 || !lines.slice(open + 1, close).some(line => line.trim())
    || fencedAt(lines, open) || lines.lastIndexOf(start) !== open || lines.lastIndexOf(end) !== close) {
    throw new ApplicationError('validation.invalid-input', 'Use exactly one complete SDD seed block with standalone opening and closing markers, or remove the seed markers.');
  }
  const seed = lines.slice(open + 1, close).join('\n') + '\n';
  return { scope: [...lines.slice(0, open), ...lines.slice(close + 1)].join('\n'), seed, hash: sddArtifactDigest(seed) };
}

function fencedAt(lines: readonly string[], lineIndex: number): boolean {
  let fence: string | undefined;
  for (const line of lines.slice(0, lineIndex)) {
    const boundary = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (!boundary) continue;
    if (!fence) fence = boundary[1];
    else if (boundary[1][0] === fence[0] && boundary[1].length >= fence.length && !boundary[2].trim()) fence = undefined;
  }
  return fence !== undefined;
}

export function isSddSeedReview(body: string, seedHash: string): boolean {
  return new RegExp('^SDD Q1: review seed (' + SHA256 + ')$', 'iu').exec(body.trimEnd())?.[1].toLowerCase() === seedHash;
}

export function matchesSddSelection(selection: SddSelection, text: string): boolean {
  return selection.kind === 'companion' ? text === 'accept companion ' + selection.receipt
    : text === 'use seed ' + selection.receipt || text === 'generate ' + selection.receipt;
}

/** A quote, fence, second command, or example in a longer comment grants no authority. */
export function readSddSelectionAnswer(body: string, selection: SddSelection): string | undefined {
  const text = /^SDD Q1: ([^\r\n]+)$/iu.exec(body.trimEnd())?.[1];
  return text && matchesSddSelection(selection, text) ? text : undefined;
}

export function sddSelectionReceipt(record: Pick<SddGateRecord, 'issueNumber' | 'issueDigest' | 'baseSha'>, plan: SddPlan,
  kind: 'seed' | 'companion', detail: string, newCapability?: SddCatalogCapability, issueScope?: string): string {
  return sddArtifactDigest(JSON.stringify([record.issueNumber, record.issueDigest, record.baseSha, plan.action, plan.capabilityId, plan.path, kind, detail, newCapability ?? null, ...(issueScope ? [issueScope] : [])]));
}

export function sddArtifactDigest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
