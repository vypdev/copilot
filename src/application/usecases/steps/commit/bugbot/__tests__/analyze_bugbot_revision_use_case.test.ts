import { DEFAULT_BUGBOT_REVIEW_CONFIGURATION } from '../../../../../../domain/bugbot/review_configuration';
import { analyzeBugbotRevision } from '../analyze_bugbot_revision_use_case';
import { BugbotReviewTelemetry } from '../bugbot_review_telemetry';
import type { BugbotReviewOperationContext } from '../bugbot_review_operation_context';
import type { BugbotContext, BugbotReviewDiffPartition } from '../types';

const headSha = 'a'.repeat(40);

function operation(): BugbotReviewOperationContext {
  return {
    repository: { owner: 'org', name: 'repo' },
    target: {
      issueNumber: 7,
      isPullRequest: true,
      pullRequestNumber: 7,
      headBranch: 'feature',
      commitBranch: 'feature',
      baseBranch: 'develop',
      pullRequestAction: 'opened',
      draft: false,
    },
    trigger: { kind: 'pull_request', headOwner: 'org' },
    ignorePatterns: [],
    organizationRules: [],
    locale: { issue: 'en-US', pullRequest: 'en-US' },
    analysis: {
      agentConfiguration: { provider: 'codex', model: 'reviewer' },
      minimumSeverity: 'low',
      commentLimit: 20,
      reviewConfiguration: DEFAULT_BUGBOT_REVIEW_CONFIGURATION,
    },
  };
}

function partition(ordinal: number, total: number): BugbotReviewDiffPartition {
  return {
    id: `diff-${ordinal}-of-${total}-${String(ordinal).padStart(8, '0')}`,
    ordinal,
    total,
    headSha,
    block: `assigned fragment ${ordinal}`,
    files: [`src/${ordinal}.ts`],
    fragmentCount: 1,
    ownsResolution: ordinal === 1,
  };
}

function context(partitions: readonly BugbotReviewDiffPartition[]): BugbotContext {
  return {
    existingByFindingId: {},
    issueComments: [],
    canonicalPullRequest: {
      number: 7,
      state: 'open',
      baseRepository: { owner: 'org', name: 'repo' },
      headRepositoryOwner: 'org',
      headRef: 'feature',
      headSha,
    },
    selectionReason: 'event',
    coverage: { status: 'complete', sources: [] },
    eligibleResolutionIds: new Set(),
    previousFindingsBlock: '',
    reviewDiffPartitions: partitions,
    reviewDiffFragmentCount: partitions.length,
    reviewDiffFileCount: partitions.length,
    prContext: { prHeadSha: headSha, prFiles: [], pathToFirstDiffLine: {}, changes: [] },
    unresolvedFindingsWithBody: [],
  };
}

function attestedResponse(prompt: string, ordinal: number, resolved: unknown[] = []) {
  return {
    outputLocale: 'en-US',
    partition_id: prompt.match(/Return partition_id exactly as `([^`]+)`/u)?.[1],
    reviewed_head_sha: headSha,
    findings: [{
      id: `finding-${ordinal}`,
      title: `Finding ${ordinal}`,
      description: `Problem ${ordinal}`,
      file: `src/${ordinal}.ts`,
      line: ordinal,
      severity: 'medium',
      confidence: 0.9,
    }],
    resolved_findings: resolved,
  };
}

describe('analyzeBugbotRevision partition execution', () => {
  it('runs every partition with maximum concurrency two and aggregates once in plan order', async () => {
    const partitions = [partition(1, 3), partition(2, 3), partition(3, 3)];
    const pending: Array<() => void> = [];
    let active = 0;
    let maximum = 0;
    let queryOrdinal = 0;
    const query = jest.fn(({ prompt }: { prompt: string }) => {
      queryOrdinal += 1;
      const ordinal = queryOrdinal;
      active += 1;
      maximum = Math.max(maximum, active);
      return new Promise<Record<string, unknown>>((resolve) => {
        pending.push(() => {
          active -= 1;
          resolve(attestedResponse(prompt, ordinal));
        });
      });
    });
    const telemetry = new BugbotReviewTelemetry(operation());
    const resultPromise = analyzeBugbotRevision(operation(), context(partitions), {
      agent: { query },
      telemetry,
    });

    await flushMicrotasks();
    expect(query).toHaveBeenCalledTimes(2);
    expect(maximum).toBe(2);
    pending[1]?.();
    await flushMicrotasks();
    expect(query).toHaveBeenCalledTimes(3);
    pending[2]?.();
    pending[0]?.();

    const prepared = await resultPromise;
    expect(prepared?.activeFindings?.map((finding) => finding.id)).toEqual([
      'finding-1', 'finding-2', 'finding-3',
    ]);
    expect(telemetry.snapshot('completed')).toEqual(expect.objectContaining({
      analysisPartitions: 3,
      completedAnalysisPartitions: 3,
      analysisDiffFragments: 3,
      analysisAssignedFiles: 3,
      maximumAnalysisConcurrency: 2,
    }));
  });

  it('fails the aggregate when a non-owner partition returns a resolution claim', async () => {
    const partitions = [partition(1, 2), partition(2, 2)];
    let ordinal = 0;
    const query = jest.fn(({ prompt }: { prompt: string }) => {
      ordinal += 1;
      return Promise.resolve(attestedResponse(
        prompt,
        ordinal,
        ordinal === 2 ? [{ id: 'old', resolution: 'fixed' }] : [],
      ));
    });

    await expect(analyzeBugbotRevision(operation(), context(partitions), {
      agent: { query },
      telemetry: new BugbotReviewTelemetry(operation()),
    })).rejects.toThrow('non-owner');
  });

  it('deduplicates one root cause reported by multiple partitions before limiting', async () => {
    const partitions = [partition(1, 2), partition(2, 2)];
    const query = jest.fn(({ prompt }: { prompt: string }) => Promise.resolve({
      ...attestedResponse(prompt, 1),
      findings: [{
        id: 'shared-root-cause',
        title: 'Shared root cause',
        description: 'The same defect is visible from both assignments.',
        file: 'src/shared.ts',
        line: 4,
        severity: 'medium',
        confidence: 0.9,
      }],
    }));

    const prepared = await analyzeBugbotRevision(operation(), context(partitions), {
      agent: { query },
      telemetry: new BugbotReviewTelemetry(operation()),
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(prepared?.activeFindings).toHaveLength(1);
    expect(prepared?.activeFindings?.[0].id).toBe('shared-root-cause');
  });

  it('fails without an aggregate when any partition query fails', async () => {
    const partitions = [partition(1, 2), partition(2, 2)];
    let ordinal = 0;
    const query = jest.fn(({ prompt }: { prompt: string }) => {
      ordinal += 1;
      return ordinal === 2
        ? Promise.reject(new Error('reviewer unavailable'))
        : Promise.resolve(attestedResponse(prompt, ordinal));
    });

    const telemetry = new BugbotReviewTelemetry(operation());
    await expect(analyzeBugbotRevision(operation(), context(partitions), {
      agent: { query },
      telemetry,
    })).rejects.toThrow('reviewer unavailable');
    expect(telemetry.snapshot('failed')).toEqual(expect.objectContaining({
      completedAnalysisPartitions: 1,
      failedAnalysisPartitionOrdinal: 2,
      failedAnalysisPartitionCategory: 'error',
    }));
  });
});

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
