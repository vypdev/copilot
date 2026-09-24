import { ApplicationError } from '../../../../errors/application_error';
import type { BugbotResponse } from './prepare_bugbot_findings_policy';
import type { BugbotReviewDiffPartition } from './types';

const MAX_PARTITION_FINDINGS_PER_RESPONSE = 200;
export const MAX_AGGREGATE_PARTITION_FINDINGS = 2_000;
const MAX_OWNER_RESOLUTIONS = 500;

/**
 * Combines a fully attested partition set into the legacy normalization shape.
 * No response is published independently; all filtering and limiting happens
 * once after this aggregate is produced.
 */
export function aggregateBugbotPartitionResponses(
  partitions: readonly BugbotReviewDiffPartition[],
  responses: readonly Readonly<Record<string, unknown>>[],
): BugbotResponse {
  if (partitions.length === 0 || responses.length !== partitions.length) {
    throw invalidAggregate('Bugbot partition response set is incomplete.');
  }
  const findings: unknown[] = [];
  let resolvedFindings: unknown[] = [];
  const observedIds = new Set<string>();

  for (let index = 0; index < partitions.length; index += 1) {
    const partition = partitions[index];
    const response = responses[index];
    if (response.partition_id !== partition.id
      || response.reviewed_head_sha !== partition.headSha
      || observedIds.has(partition.id)) {
      throw invalidAggregate('Bugbot partition identity is missing, duplicated, or stale.');
    }
    observedIds.add(partition.id);
    if (!Array.isArray(response.findings)
      || response.findings.length > MAX_PARTITION_FINDINGS_PER_RESPONSE
      || !Array.isArray(response.resolved_findings)
      || response.resolved_findings.length > MAX_OWNER_RESOLUTIONS) {
      throw invalidAggregate('Bugbot partition response exceeds its structured-output bounds.');
    }
    if (!partition.ownsResolution && response.resolved_findings.length > 0) {
      throw invalidAggregate('A non-owner Bugbot partition attempted to resolve prior findings.');
    }
    if (findings.length + response.findings.length > MAX_AGGREGATE_PARTITION_FINDINGS) {
      throw invalidAggregate('Bugbot aggregate finding output exceeds its fixed safety limit.');
    }
    findings.push(...response.findings);
    if (partition.ownsResolution) resolvedFindings = [...response.resolved_findings];
  }

  return {
    findings: findings as BugbotResponse['findings'],
    resolved_findings: resolvedFindings as BugbotResponse['resolved_findings'],
  };
}

function invalidAggregate(message: string): ApplicationError {
  return new ApplicationError('agent.failed', message);
}
