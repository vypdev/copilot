import { observeBugbotShadowVerification } from '../observe_bugbot_shadow_verification';
import { prepareBugbotFindings } from '../prepare_bugbot_findings';
import { BugbotCandidateTrace } from '../bugbot_candidate_trace';
import type { BugbotReviewOperationContext } from '../bugbot_review_operation_context';
import type { BugbotContext } from '../types';
import { DEFAULT_BUGBOT_REVIEW_CONFIGURATION } from '../../../../../../domain/bugbot/review_configuration';

it.each(['live-target', 'left-merge-base', 'legacy-comparison'])('pins base evidence by its purpose: %s', async mode => {
    const comparison = 'a'.repeat(40), live = 'b'.repeat(40), head = 'c'.repeat(40), merge = 'd'.repeat(40);
    const side = mode === 'left-merge-base' ? 'LEFT' : 'RIGHT';
    const finding = { id: 'base-case', title: 'A regression loses the previous value', description: 'A reachable route.',
        file: 'src/value.ts', line: 14 };
    const prepared = prepareBugbotFindings({ findings: [finding] }, [], 'low', 10)!;
    const operation = { analysis: { agentConfiguration: { provider: 'codex', model: 'fixture' },
        reviewConfiguration: { ...DEFAULT_BUGBOT_REVIEW_CONFIGURATION, publicationMode: 'dry-run' } },
        repository: { owner: 'fixture', name: 'repo' }, trigger: { kind: 'pull_request' },
    } as unknown as BugbotReviewOperationContext;
    const context = { canonicalPullRequest: { number: 1, headSha: head, baseSha: comparison,
        ...(mode === 'legacy-comparison' ? {} : { baseRefSha: live }), baseRepository: operation.repository },
        prContext: { prHeadSha: head, pathToDiffLocations: { [finding.file]: [{ line: 14, side }] } },
        unresolvedFindingsWithBody: [],
        ...(mode === 'left-merge-base' ? { reviewFramedSource: { identity: { baseSha: live, mergeBaseSha: merge } } } : {}),
    } as unknown as BugbotContext;
    const verify = jest.fn().mockResolvedValue({ status: 'technical-failure', reason: 'fixture' });
    await observeBugbotShadowVerification(operation, context, prepared, { verify }, new BugbotCandidateTrace(), 0);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0][0].candidate).toMatchObject({ headSha: head, allowBase: true,
        baseSha: mode === 'left-merge-base' ? merge : mode === 'live-target' ? live : comparison,
        anchor: { path: finding.file, line: 14, side } });
});
