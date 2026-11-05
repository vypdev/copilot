import { createHash } from 'node:crypto';
import type { SddGateRecord, SddPlan } from '../../domain/pre_branch_sdd';
import type { SddCatalogCapability } from '../../domain/sdd_catalog_compatibility';

const SHA256 = '[a-f0-9]{64}';
const start = '<!-- copilot:sdd-seed -->';
const end = '<!-- /copilot:sdd-seed -->';

export function readSddSeed(body: string): { scope: string; seed?: string; hash?: string } {
  const normalized = body.replace(/\r\n/gu, '\n');
  const lines = normalized.split('\n');
  const open = lines.indexOf(start), close = lines.indexOf(end);
  if (open < 0 || close <= open + 1 || lines.lastIndexOf(start) !== open || lines.lastIndexOf(end) !== close) return { scope: body };
  const seed = lines.slice(open + 1, close).join('\n') + '\n';
  return { scope: [...lines.slice(0, open), ...lines.slice(close + 1)].join('\n'), seed, hash: sddArtifactDigest(seed) };
}

export function isSddSeedReview(body: string, seedHash: string): boolean {
  return new RegExp('^SDD Q1: review seed (' + SHA256 + ')\\s*$', 'imu').exec(body)?.[1].toLowerCase() === seedHash;
}

export function sddSelectionReceipt(record: Pick<SddGateRecord, 'issueNumber' | 'issueDigest' | 'baseSha'>, plan: SddPlan,
  kind: 'seed' | 'companion', detail: string, newCapability?: SddCatalogCapability): string {
  return sddArtifactDigest(JSON.stringify([record.issueNumber, record.issueDigest, record.baseSha, plan.action, plan.capabilityId, plan.path, kind, detail, newCapability ?? null]));
}

export function sddArtifactDigest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
