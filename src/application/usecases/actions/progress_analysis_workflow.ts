import { analyzeProgressBatches } from './progress_batch_workflow';
import { readSddSeed, type SddSeedInput } from '../../policies/sdd_selection_policy';
import type { ProgressSddPublication, ProgressSddSeedQuery } from '../../ports/progress_sdd_seed_ports';
import { captureProgressScopeSource } from '../../policies/progress_scope_source_policy';
import { progressSddSeedUnavailable, reconcileProgressSddScope } from '../../policies/progress_sdd_scope_policy';
import type { BoundProgressComparisonSourceQueryPort, ProgressComparisonSource } from '../../ports/progress_comparison_source_ports';
import { selectProgressComparisonSource } from '../../policies/progress_comparison_source_policy';
import { isAgentConfigurationReady } from '../../../data/model/agent';
import { Result } from '../../../data/model/result';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { BoundIssueDescriptionQueryPort } from '../../ports/issue_description_ports';
import type { BoundBranchListQueryPort } from '../../ports/branch_lifecycle_ports';
import type { ProgressContext } from '../push_single_action_contexts';
import { logError, logInfo } from '../../ports/logging_ports';
import type { BoundProgressDiffQueryPort } from '../../ports/progress_diff_query_ports';
import { findIssueBranch } from './find_issue_branch';
import { validateProgressPrerequisites } from './progress_prerequisite_policy';
import { ApplicationError, type ApplicationErrorCode } from '../../errors/application_error';
import type { BoundPublicationSourceQueryPort } from '../../ports/publication_freshness_ports';
import { validateFramedProgressEvidence } from '../../policies/progress_evidence_protocol_policy';
import { withProgressCapacityContext } from '../../policies/progress_capacity_context_policy';
import { progressCapacityDiffContext } from '../../policies/progress_capacity_source_context_policy';

export interface ProgressAnalysisDependencies {
    issueDescriptionQueryPort: BoundIssueDescriptionQueryPort;
    branchRepository: BoundBranchListQueryPort;
    aiRepository: FindingsQueryPort;
    publicationSourceQuery: BoundPublicationSourceQueryPort;
    progressDiffQuery: BoundProgressDiffQueryPort;
    progressComparisonSourceQuery: BoundProgressComparisonSourceQueryPort;
    progressSddSeedQuery?: ProgressSddSeedQuery;
}

export type ProgressAnalysis =
    | { kind: 'failure'; result: Result }
    | { kind: 'stale-source'; branch: string; sourceHeadSha: string }
    | {
        kind: 'ready';
        issueNumber: number;
        issueDescription: string;
        branch: string;
        developmentBranch: string;
        baseSha: string;
        comparisonSource: ProgressComparisonSource;
        sourceHeadSha: string;
        attemptResult: Awaited<ReturnType<typeof analyzeProgressBatches>>['attemptResult'];
        verifyScopePublication?: () => Promise<void>;
        scopePublication?: ProgressSddPublication;
        scopeManifestDigest: string;
        verifyAssessment: () => unknown;
    };

/** Loads progress context and asks the configured agent for an assessment. */
export async function analyzeProgress(
    param: ProgressContext,
    taskId: string,
    dependencies: ProgressAnalysisDependencies,
    publishedSeedExpected: boolean,
): Promise<ProgressAnalysis> {
    const issueNumber = param.issueNumber;
    const agentReady = isAgentConfigurationReady(
        param.agentConfiguration,
    );
    if (!agentReady) {
        const message = 'Missing required agent configuration. Provide a model and a valid executable.';
        logError(message);
        return { kind: 'failure', result: failure(taskId, message, 'configuration.invalid') };
    }
    if (issueNumber === -1) {
        const message = 'Issue number not found. Cannot check progress without an issue number.';
        logError(message);
        return { kind: 'failure', result: failure(taskId, message, 'validation.invalid-input') };
    }

    logInfo(`📋 Checking progress for issue #${issueNumber}`);
    const issueDescription = await dependencies.issueDescriptionQueryPort.getDescription(
        issueNumber,
    );
    if (!issueDescription) {
        const message = `Could not retrieve issue description for issue #${issueNumber}`;
        logError(message);
        return { kind: 'failure', result: failure(taskId, message, 'provider.not-found') };
    }

    const branch = await findIssueBranch(param, dependencies.branchRepository);
    const prerequisiteError = validateProgressPrerequisites({
        agentReady,
        issueNumber,
        issueDescription,
        branch,
    });
    if (prerequisiteError) {
        logError(prerequisiteError);
        return {
            kind: 'failure',
            result: failure(
                taskId,
                branch
                    ? prerequisiteError
                    : `Could not find branch for issue #${issueNumber}. Please ensure a branch exists with pattern: feature/${issueNumber}-*, bugfix/${issueNumber}-*, docs/${issueNumber}-*, or chore/${issueNumber}-*`,
                'provider.not-found',
            ),
        };
    }

    const resolvedBranch = branch as string;
    const sourceHeadSha = await dependencies.publicationSourceQuery.getBranchHeadSha(resolvedBranch);
    if (param.sourceHeadSha && param.sourceHeadSha !== sourceHeadSha) {
        return { kind: 'stale-source', branch: resolvedBranch, sourceHeadSha: param.sourceHeadSha };
    }
    const developmentBranch = param.developmentBranch;
    const comparisonSource = selectProgressComparisonSource(
        await dependencies.progressComparisonSourceQuery.getSource(resolvedBranch), developmentBranch, resolvedBranch, sourceHeadSha);
    const baseSha = await dependencies.publicationSourceQuery.getBranchHeadSha(comparisonSource.baseBranch);
    const sourceLog = JSON.stringify({ source: comparisonSource, baseSha, headBranch: resolvedBranch, sourceHeadSha })
        .replace(/[\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu, point => `\\u${point.codePointAt(0)!.toString(16).padStart(4, '0')}`);
    logInfo(`Progress comparison source (native metadata): ${sourceLog}`);
    const diff = await dependencies.progressDiffQuery.getDiff(baseSha, sourceHeadSha);
    if (diff.baseSha !== baseSha || diff.headSha !== sourceHeadSha) throw new ApplicationError('workflow.stale', 'Progress comparison identity changed. Existing state retained.');
    if (diff.kind === 'partitioned' && diff.protocol) {
        validateFramedProgressEvidence(diff);
        logInfo(`Complete progress evidence: ${diff.protocol.requiredPaths.length} required paths; recovery usage ${JSON.stringify(diff.protocol.recovery)}; ${diff.partitions.length} source parts. Previous progress remains until final validation.`);
    }
    logInfo('Progress will be assessed from a bounded GitHub comparison pinned to the base and source heads.');
    const capacityContext = () => progressCapacityDiffContext(diff);
    const originalScopeSource = withProgressCapacityContext(() => captureProgressScopeSource(issueDescription), capacityContext);
    const seed = readProgressSeed(issueDescription);
    if (publishedSeedExpected && seed.seed === undefined) throw progressSddSeedUnavailable();
    let capturedScopeSource = originalScopeSource;
    let verifyScopePublication: (() => Promise<void>) | undefined;
    if (seed.seed !== undefined) {
        const query = dependencies.progressSddSeedQuery;
        if (!query) throw progressSddSeedUnavailable();
        const request = { issueNumber, issueBody: issueDescription, trustedBotLogin: param.trustedBotLogin,
            issueKind: param.issueKind, profileDigest: param.profileDigest, branch: resolvedBranch, headSha: sourceHeadSha,
            seed: seed.seed, seedHash: seed.hash };
        const publication = await query(request);
        capturedScopeSource = reconcileProgressSddScope(originalScopeSource, seed, publication);
        verifyScopePublication = async () => {
            if (JSON.stringify(await query(request)) !== JSON.stringify(publication)) throw progressSddSeedUnavailable();
        };
        logInfo(`Progress scope reconciled with verified SDD publication ${publication.commitSha}; ${originalScopeSource.lines.length - capturedScopeSource.lines.length} source lines accounted for outside the classifier.`);
    }
    const { attemptResult, scopeManifestDigest, verifyAssessment } = await analyzeProgressBatches(
        { ...param, pushedBranch: resolvedBranch }, issueDescription, capturedScopeSource, diff, comparisonSource, dependencies.aiRepository, originalScopeSource.lines);

    return {
        kind: 'ready',
        issueNumber,
        issueDescription,
        branch: resolvedBranch,
        developmentBranch,
        baseSha,
        comparisonSource,
        sourceHeadSha,
        attemptResult,
        verifyScopePublication,
        scopePublication: capturedScopeSource.draft?.publication,
        scopeManifestDigest,
        verifyAssessment,
    };
}

function failure(taskId: string, message: string, code: ApplicationErrorCode): Result {
    return new Result({
        id: taskId,
        success: false,
        executed: true,
        errors: [new ApplicationError(code, message)],
    });
}

function readProgressSeed(body: string): SddSeedInput {
    try {
        return readSddSeed(body);
    } catch {
        throw progressSddSeedUnavailable();
    }
}
