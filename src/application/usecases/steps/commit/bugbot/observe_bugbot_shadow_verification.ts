import type { BugbotFinding } from '../../../../../domain/bugbot/finding';
import { canonicalGitObjectId } from '../../../../../domain/git_object_id';
import type {
    BugbotShadowAnchor,
    BugbotShadowCandidate,
    BugbotShadowResult,
    BugbotShadowVerificationPort,
} from '../../../../ports/bugbot_shadow_verification_ports';
import { runWithConcurrencyLimit } from '../../../../policies/bounded_concurrency_policy';
import type { BugbotReviewOperationContext } from './bugbot_review_operation_context';
import type { BugbotContext } from './types';

type Observation = BugbotShadowResult & {
    readonly id: string;
    readonly candidate?: BugbotShadowCandidate;
};

export interface BugbotShadowVerificationReport {
    readonly resolvedModel: string;
    readonly provider: string;
    readonly candidates: readonly Observation[];
    readonly detectionUnavailable?: true;
}

export async function observeBugbotShadowVerification(
    operation: BugbotReviewOperationContext,
    context: BugbotContext,
    findings: readonly BugbotFinding[],
    port: BugbotShadowVerificationPort,
): Promise<BugbotShadowVerificationReport> {
    const configuration = operation.analysis.agentConfiguration;
    const tasks = findings.map(finding => async (): Promise<Observation> => {
        const candidate = pinCandidate(context, finding);
        if (!candidate) return { id: finding.id, status: 'technical-failure', reason: 'unbound-candidate' };
        try {
            const observation = await port.verify({ candidate, configuration });
            if (observation.reportedModel && observation.reportedModel !== configuration.model) {
                return { id: finding.id, candidate, status: 'technical-failure', reason: 'reported-model-mismatch',
                    reportedModel: observation.reportedModel };
            }
            return { ...observation, id: finding.id, candidate };
        } catch {
            return { id: finding.id, candidate, status: 'technical-failure', reason: 'verifier-unavailable' };
        }
    });
    const candidates = await runWithConcurrencyLimit(tasks, 2);
    return { resolvedModel: configuration.model, provider: configuration.provider, candidates };
}

function pinCandidate(context: BugbotContext, finding: BugbotFinding): BugbotShadowCandidate | undefined {
    const pr = context.canonicalPullRequest;
    const headSha = canonicalGitObjectId(context.prContext?.prHeadSha);
    const hypothesis = finding.title.trim();
    const { file, line, endLine } = finding;
    if (!pr || !headSha || canonicalGitObjectId(pr.headSha) !== headSha || !file || !line
        || !Number.isSafeInteger(line) || line < 1 || !hypothesis) return undefined;
    const locations = context.prContext?.pathToDiffLocations?.[file] ?? [];
    const sides = new Set(locations.filter(location => location.line === line).map(location => location.side));
    const side = sides.size === 1 ? sides.values().next().value : undefined;
    const anchor: BugbotShadowAnchor = Object.freeze({ path: file, line,
        end: endLine && Number.isSafeInteger(endLine) && endLine >= line ? endLine : line,
        ...(side ? { side } : {}) });
    // The published title is the claim. Description, confidence, detector evidence and proposed fixes stay out.
    const comparisonRelevant = side === 'LEFT' || /\b(regressions?|regresi[oó]n|previously|used to|no longer|introduc\w*)\b/iu
        .test(hypothesis + '\n' + finding.description);
    const baseSha = canonicalGitObjectId(pr.baseSha);
    return Object.freeze({
        id: finding.id, hypothesis, anchor,
        repository: Object.freeze({ owner: pr.baseRepository.owner, name: pr.baseRepository.name }),
        pullRequest: pr.number, headSha, allowBase: Boolean(baseSha && comparisonRelevant), ...(baseSha ? { baseSha } : {}),
    });
}
