import type {
    BugbotFinding,
    ExistingByFindingId,
    ExistingFindingInfo,
} from '../../domain/bugbot/finding';
import type {
    BugbotReconciliationPlan,
    BugbotSnapshotCompleteness,
} from '../contracts/bugbot_reconciliation';
import type {
    BugbotObservedFindingDestinations,
    BugbotProviderProjection,
} from './bugbot_provider_projection_policy';

/** Builds the deterministic, side-effect-free plan consumed by presentation. */
export function buildBugbotReconciliationPlan(input: {
    readonly providerProjection: BugbotProviderProjection;
    readonly existingByFindingId: ExistingByFindingId;
    readonly previousFindingTitles: ReadonlyMap<string, string>;
    readonly activeFindings: readonly BugbotFinding[];
    readonly expectedPublishedFindings: readonly BugbotFinding[];
    readonly diagnostics?: readonly string[];
}): BugbotReconciliationPlan {
    const diagnostics = [...(input.diagnostics ?? [])];
    const projected = new Map(
        input.providerProjection.findings.map((finding) => [finding.id, finding]),
    );
    if (input.providerProjection.malformedEvidence) {
        diagnostics.push('A trusted Bugbot finding marker is malformed.');
    }

    const missingDurableFindingIds = findMissingNonCleanDurableFindingIds(
        input.existingByFindingId,
        input.providerProjection.observed,
    );
    const missingDurableFindingIdSet = new Set(missingDurableFindingIds);
    for (const findingId of missingDurableFindingIds) {
        const previous = input.existingByFindingId[findingId];
        const providerFinding = projected.get(findingId);
        projected.set(findingId, {
            ...providerFinding,
            id: findingId,
            state: 'unknown',
            title: providerFinding?.title
                ?? input.previousFindingTitles.get(findingId)
                ?? findingId,
            ...(previous?.pullRequest?.parentReviewIdentity
                ? { parentReviewIdentity: previous.pullRequest.parentReviewIdentity }
                : {}),
        });
    }
    if (missingDurableFindingIds.length > 0) {
        diagnostics.push(
            `The final provider snapshot omitted ${missingDurableFindingIds.length} previously observed unresolved or unverified Bugbot finding(s).`,
        );
    }

    const expectedPublishedIds = new Set(
        input.expectedPublishedFindings.map((finding) => finding.id),
    );
    for (const finding of input.expectedPublishedFindings) {
        if (input.providerProjection.observed.pullRequestFindingIds.has(finding.id)) continue;
        const existing = projected.get(finding.id);
        projected.set(finding.id, {
            ...existing,
            id: finding.id,
            state: 'unknown',
            title: finding.title,
        });
        if (!missingDurableFindingIdSet.has(finding.id)) {
            diagnostics.push(`Published finding ${finding.id} is not yet observable from GitHub.`);
        }
    }

    for (const finding of input.activeFindings) {
        if (projected.has(finding.id) || expectedPublishedIds.has(finding.id)) continue;
        projected.set(finding.id, {
            id: finding.id,
            state: 'open',
            title: finding.title,
        });
    }
    return { findings: [...projected.values()], diagnostics };
}

/** Maps explicit snapshot completeness to bounded, provider-safe diagnostics. */
export function describeBugbotSnapshotFailures(
    completeness: BugbotSnapshotCompleteness,
): string[] {
    const messages: Array<readonly [keyof BugbotSnapshotCompleteness, string]> = [
        ['pullRequestComments', 'Unable to re-read pull request review comments.'],
        ['reviewThreads', 'Unable to re-read pull request review thread state.'],
        ['reviews', 'Unable to re-read pull request reviews.'],
        ['conversation', 'Unable to re-read the pull request conversation.'],
        ['linkedIssueComments', 'Unable to re-read linked issue finding comments.'],
        ['navigation', 'Unable to build safe Bugbot navigation links.'],
    ];
    return messages.flatMap(([surface, message]) =>
        completeness[surface] === 'failed' ? [message] : [],
    );
}

/**
 * Finds durable findings whose last trusted state was not clean but which are
 * absent from the final provider projection. A successful read is not proof
 * that a previously observed finding was deleted intentionally, so omission
 * must fail closed until a later read can verify its state.
 */
export function findMissingNonCleanDurableFindingIds(
    existingByFindingId: ExistingByFindingId,
    observed: BugbotObservedFindingDestinations,
): string[] {
    return Object.entries(existingByFindingId)
        .filter(([findingId, finding]) =>
            hasMissingNonCleanDurableDestination(findingId, finding, observed),
        )
        .map(([findingId]) => findingId)
        .sort((left, right) => left.localeCompare(right));
}

/**
 * Accepts a model's resolution claims only when they refer to an existing
 * finding and no active finding with the same id or local fingerprint remains.
 * This prevents a stale or injected response from resolving a live finding.
 */
export function reconcileResolvedFindingIds(
    resolvedFindingIds: ReadonlySet<string>,
    existingByFindingId: ExistingByFindingId,
    activeFindings: readonly BugbotFinding[],
): Set<string> {
    const activeIds = new Set(activeFindings.map((finding) => finding.id));
    const activeFingerprints = new Set(activeFindings.flatMap((finding) => finding.fingerprint ? [finding.fingerprint] : []));
    const activeSemanticFingerprints = new Set(activeFindings.flatMap((finding) => finding.semanticFingerprint ? [finding.semanticFingerprint] : []));
    return new Set([...resolvedFindingIds].filter((findingId) => {
        const existing = existingByFindingId[findingId];
        if (!existing || activeIds.has(findingId)) return false;
        const fingerprint = existing.issue?.fingerprint ?? existing.pullRequest?.fingerprint;
        const semanticFingerprint = existing.issue?.semanticFingerprint ?? existing.pullRequest?.semanticFingerprint;
        return (!fingerprint || !activeFingerprints.has(fingerprint))
            && (!semanticFingerprint || !activeSemanticFingerprints.has(semanticFingerprint));
    }));
}

function hasMissingNonCleanDurableDestination(
    findingId: string,
    finding: ExistingFindingInfo,
    observed: BugbotObservedFindingDestinations,
): boolean {
    const issueMissing = finding.issue?.resolved === false
        && !observed.issueFindingIds.has(findingId);
    const pullRequestRequiresEvidence = finding.pullRequest?.resolved === false
        || finding.pullRequest?.verificationRequired === true;
    const pullRequestMissing = pullRequestRequiresEvidence
        && !observed.pullRequestFindingIds.has(findingId);
    return issueMissing || pullRequestMissing;
}
