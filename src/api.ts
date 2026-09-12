import type { Execution } from './data/model/execution';
import { Ai } from './data/model/ai';
import type { Result } from './data/model/result';
import type { AgentConfiguration } from './domain/agent';
import type { FindingsQueryPort } from './application/ports/agent_findings_ports';
import type { BugbotContextPorts } from './application/ports/bugbot_context_ports';
import type { BugbotFindingPublicationPorts } from './application/ports/bugbot_finding_publication_ports';
import type { BugbotFindingResolutionPorts } from './application/ports/bugbot_finding_resolution_ports';
import type { BugbotTelemetryPort } from './application/ports/bugbot_telemetry_ports';
import type { BugbotReviewConfiguration } from './domain/bugbot/review_configuration';
import { DetectPotentialProblemsUseCase } from './application/usecases/steps/commit/detect_potential_problems_use_case';
import { ApplicationError, toApplicationError } from './application/errors/application_error';
import { runAtApplicationErrorBoundary } from './application/errors/application_error_context';

export interface BugbotScmGateway {
    readonly context: BugbotContextPorts;
    readonly publication: BugbotFindingPublicationPorts;
    readonly resolution: BugbotFindingResolutionPorts;
    readonly telemetry?: BugbotTelemetryPort;
}

export type BugbotMinimumSeverity = 'info' | 'low' | 'medium' | 'high';

export type BugbotReviewTarget =
    | {
        readonly kind: 'pull-request';
        readonly number: number;
        readonly head: string;
        readonly base?: string;
        readonly linkedIssueNumber?: number;
        readonly action?: 'opened' | 'reopened' | 'synchronize';
        readonly expectedHeadSha?: string;
        readonly before?: string;
        readonly draft?: boolean;
    }
    | {
        readonly kind: 'branch';
        readonly branch: string;
        readonly base?: string;
        readonly issueNumber?: number;
        readonly before?: string;
        readonly after?: string;
    };

/** Sole supported request for the programmatic Bugbot review entry point. */
export interface BugbotReviewRequest {
    readonly repository: {
        readonly owner: string;
        readonly name: string;
    };
    readonly credential: {
        readonly token: string;
    };
    readonly target: BugbotReviewTarget;
    readonly agent: AgentConfiguration;
    readonly configuration?: Partial<BugbotReviewConfiguration>;
    readonly ignoreFiles?: readonly string[];
    readonly minimumSeverity?: BugbotMinimumSeverity;
    readonly commentLimit?: number;
    readonly authenticatedUser?: string;
    readonly locale?: {
        readonly issue?: string;
        readonly pullRequest?: string;
    };
}

/** Provider-neutral programmatic entry point. Consumers supply agent and SCM adapters. */
export class BugbotReviewService {
    private readonly useCase: DetectPotentialProblemsUseCase;

    constructor(agent: FindingsQueryPort, scm: BugbotScmGateway) {
        this.useCase = new DetectPotentialProblemsUseCase(
            agent,
            scm.context,
            scm.publication,
            scm.resolution,
            scm.telemetry,
        );
    }

    async review(request: BugbotReviewRequest): Promise<readonly Result[]> {
        return runAtApplicationErrorBoundary(async () => {
            try {
                return await this.useCase.invoke(buildReviewExecution(request));
            } catch (cause) {
                throw toApplicationError(cause, 'unexpected', 'Bugbot review failed.');
            }
        });
    }
}

function buildReviewExecution(request: BugbotReviewRequest): Execution {
    if (!request || typeof request !== 'object') {
        throw new ApplicationError('validation.invalid-input', 'Bugbot review request is missing or invalid.');
    }
    const owner = requireText(request.repository?.owner, 'Repository owner', 100);
    const repository = requireText(request.repository?.name, 'Repository name', 100);
    const token = requireText(request.credential?.token, 'SCM credential', 10_000, 'authorization.credential-invalid');
    const commentLimit = request.commentLimit ?? 20;
    if (!Number.isSafeInteger(commentLimit) || commentLimit < 1 || commentLimit > 100) {
        throw new ApplicationError('configuration.invalid', 'Bugbot comment limit must be an integer between 1 and 100.');
    }
    if (!['opencode', 'codex', 'cursor'].includes(request.agent?.provider)) {
        throw new ApplicationError('configuration.unsupported', 'The requested agent provider is not supported.');
    }
    validateAgentConfiguration(request.agent);

    const target = normalizeTarget(request.target);
    const agent = { ...request.agent };
    const ignoreFiles = normalizeIgnoreFiles(request.ignoreFiles);
    const configuration = validateReviewConfiguration(request.configuration);
    const minimumSeverity = request.minimumSeverity ?? 'low';
    if (!['info', 'low', 'medium', 'high'].includes(minimumSeverity)) {
        throw new ApplicationError('configuration.invalid', 'Bugbot minimum severity is invalid.');
    }
    const ai = new Ai(
        '',
        agent.model,
        false,
        ignoreFiles,
        false,
        minimumSeverity,
        commentLimit,
        [],
        { findings: agent, fixer: agent, reviewer: agent },
        'replace',
        configuration,
    );
    const isPullRequest = target.kind === 'pull-request';
    const issueNumber = isPullRequest ? target.linkedIssueNumber ?? -1 : target.issueNumber ?? -1;
    const branch = isPullRequest ? target.head : target.branch;
    const eventName = isPullRequest ? 'pull_request' : 'push';
    const action = isPullRequest ? target.action ?? 'synchronize' : '';
    const inputs = {
        eventName,
        action,
        repo: { owner, repo: repository },
        ref: `refs/heads/${branch}`,
        ...(target.before ? { before: target.before } : {}),
        ...(!isPullRequest && target.after ? { after: target.after } : {}),
        ...(isPullRequest ? {
            pull_request: {
                number: target.number,
                draft: target.draft ?? false,
                head: { ref: target.head, ...(target.expectedHeadSha ? { sha: target.expectedHeadSha } : {}) },
                base: { ref: target.base ?? 'develop' },
            },
        } : {}),
    };

    // This is the only public-to-internal aggregate boundary. Every mutable
    // input is copied, and the aggregate itself remains absent from the API.
    return {
        ai,
        owner,
        repo: repository,
        issueNumber,
        isPullRequest,
        eventName,
        inputs,
        tokenUser: optionalText(request.authenticatedUser, 'Authenticated user', 255),
        tokens: { token },
        commit: { branch },
        branches: { development: target.base ?? 'develop' },
        currentConfiguration: { parentBranch: target.base },
        pullRequest: isPullRequest
            ? { number: target.number, head: target.head, action }
            : { number: -1, head: '', action: '' },
        locale: {
            issue: optionalText(request.locale?.issue, 'Issue locale', 64) ?? 'en-US',
            pullRequest: optionalText(request.locale?.pullRequest, 'Pull request locale', 64) ?? 'en-US',
        },
    } as unknown as Execution;
}

function normalizeTarget(target: BugbotReviewTarget): BugbotReviewTarget {
    if (!target || !['pull-request', 'branch'].includes(target.kind)) {
        throw new ApplicationError('validation.invalid-input', 'Bugbot review target must be a branch or pull request.');
    }
    if (target.kind === 'pull-request') {
        if (!Number.isSafeInteger(target.number) || target.number < 1) {
            throw new ApplicationError('validation.invalid-input', 'Pull request number must be a positive integer.');
        }
        validateOptionalPositiveInteger(target.linkedIssueNumber, 'Linked issue number');
        if (target.action !== undefined && !['opened', 'reopened', 'synchronize'].includes(target.action)) {
            throw new ApplicationError('validation.invalid-input', 'Pull request action is invalid.');
        }
        if (target.draft !== undefined && typeof target.draft !== 'boolean') {
            throw new ApplicationError('validation.invalid-input', 'Pull request draft state is invalid.');
        }
        return {
            ...target,
            head: requireText(target.head, 'Pull request head branch', 255),
            base: optionalText(target.base, 'Pull request base branch', 255),
            expectedHeadSha: optionalObjectId(target.expectedHeadSha, 'Expected pull request head SHA'),
            before: optionalObjectId(target.before, 'Pull request before SHA'),
        };
    }
    validateOptionalPositiveInteger(target.issueNumber, 'Issue number');
    return {
        ...target,
        branch: requireText(target.branch, 'Review branch', 255),
        base: optionalText(target.base, 'Review base branch', 255),
        before: optionalObjectId(target.before, 'Branch before SHA'),
        after: optionalObjectId(target.after, 'Branch after SHA'),
    };
}

function validateAgentConfiguration(agent: AgentConfiguration): void {
    const allowedKeys = new Set(['provider', 'modelProvider', 'model', 'effort', 'executable']);
    if (!agent || typeof agent !== 'object'
        || Object.keys(agent).some(key => !allowedKeys.has(key))
        || !['codex', 'opencode', 'cursor'].includes(agent.provider)
        || typeof agent.model !== 'string'
        || (agent.executable !== undefined && typeof agent.executable !== 'string')
        || (agent.modelProvider !== undefined && typeof agent.modelProvider !== 'string')
        || (agent.effort !== undefined && typeof agent.effort !== 'string')) {
        throw new ApplicationError('configuration.invalid', 'Agent configuration is invalid.');
    }
    if (agent.model.length > 500 || (agent.executable?.length ?? 0) > 4_096
        || (agent.modelProvider?.length ?? 0) > 100 || (agent.effort?.length ?? 0) > 100) {
        throw new ApplicationError('configuration.invalid', 'Agent configuration exceeds the supported limits.');
    }
}

function normalizeIgnoreFiles(value: readonly string[] | undefined): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 1_000
        || value.some(item => typeof item !== 'string' || item.length > 1_024 || /[\r\n\0]/u.test(item))) {
        throw new ApplicationError('configuration.invalid', 'Bugbot ignored file patterns are invalid.');
    }
    return [...value];
}

function validateReviewConfiguration(
    value: Partial<BugbotReviewConfiguration> | undefined,
): Partial<BugbotReviewConfiguration> | undefined {
    if (value === undefined) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ApplicationError('configuration.invalid', 'Bugbot review configuration is invalid.');
    }
    const allowedKeys = new Set<keyof BugbotReviewConfiguration>([
        'publicationMode', 'effort', 'reviewDrafts', 'traceRules', 'suggestedChanges',
        'telemetry', 'failOnUnresolved', 'organizationRules',
    ]);
    if (Object.keys(value).some(key => !allowedKeys.has(key as keyof BugbotReviewConfiguration))) {
        throw new ApplicationError('configuration.invalid', 'Bugbot review configuration contains an unsupported field.');
    }
    if (value.publicationMode !== undefined && !['publish', 'dry-run'].includes(value.publicationMode)) {
        throw new ApplicationError('configuration.invalid', 'Bugbot publication mode is invalid.');
    }
    if (value.effort !== undefined && !['low', 'default', 'high', 'smart'].includes(value.effort)) {
        throw new ApplicationError('configuration.invalid', 'Bugbot review effort is invalid.');
    }
    const booleanKeys: readonly (keyof BugbotReviewConfiguration)[] = [
        'reviewDrafts', 'traceRules', 'suggestedChanges', 'telemetry', 'failOnUnresolved',
    ];
    if (booleanKeys.some(key => value[key] !== undefined && typeof value[key] !== 'boolean')) {
        throw new ApplicationError('configuration.invalid', 'Bugbot review flags must be boolean values.');
    }
    if (value.organizationRules !== undefined
        && (!Array.isArray(value.organizationRules)
            || value.organizationRules.length > 100
            || value.organizationRules.some(rule => typeof rule !== 'string' || rule.length > 2_000))) {
        throw new ApplicationError('configuration.invalid', 'Bugbot organization rules are invalid.');
    }
    return {
        ...value,
        organizationRules: value.organizationRules ? [...value.organizationRules] : undefined,
    };
}

function validateOptionalPositiveInteger(value: number | undefined, field: string): void {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
        throw new ApplicationError('validation.invalid-input', `${field} must be a positive integer.`);
    }
}

function optionalObjectId(value: string | undefined, field: string): string | undefined {
    const normalized = optionalText(value, field, 64);
    if (normalized !== undefined && !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(normalized)) {
        throw new ApplicationError('validation.invalid-input', `${field} is invalid.`);
    }
    return normalized;
}

function optionalText(value: string | undefined, field: string, maximum: number): string | undefined {
    return value === undefined ? undefined : requireText(value, field, maximum);
}

function requireText(
    value: unknown,
    field: string,
    maximum: number,
    code: 'validation.invalid-input' | 'authorization.credential-invalid' = 'validation.invalid-input',
): string {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized || normalized.length > maximum || /[\r\n\0]/u.test(normalized)) {
        throw new ApplicationError(code, `${field} is missing or invalid.`);
    }
    return normalized;
}

export { evaluateBugbotFindings, evaluateBugbotQualityGate } from './tooling/bugbot_quality_eval';
export { evaluateBugbotBenchmark, loadBugbotBenchmark, loadBugbotPredictions } from './tooling/bugbot_benchmark';
export { buildBugbotAnalytics, parseBugbotTelemetry } from './tooling/bugbot_analytics';
export { buildSemanticFindingFingerprint, buildFindingFingerprint } from './domain/bugbot/finding_identity';
export { normalizeBugbotReviewConfiguration, resolveBugbotReviewEffort } from './domain/bugbot/review_configuration';
export {
    BUGBOT_FINDING_STATES,
    classifyBugbotFindingState,
    countActionableBugbotFindings,
    countBugbotFindingStates,
    isBugbotActionableState,
    isBugbotCleanState,
} from './domain/bugbot/review_state';
export { buildBugbotReviewProjection } from './domain/bugbot/review_projection';
export { ApplicationError } from './application/errors/application_error';
export type {
    ApplicationErrorCode,
    ApplicationErrorKind,
    ApplicationErrorPublicRecord,
} from './application/errors/application_error';
export type { AgentConfiguration } from './domain/agent';
export type { FindingsQueryPort } from './application/ports/agent_findings_ports';
export type { BugbotContextPorts } from './application/ports/bugbot_context_ports';
export type { BugbotFindingPublicationPorts } from './application/ports/bugbot_finding_publication_ports';
export type { BugbotFindingResolutionPorts } from './application/ports/bugbot_finding_resolution_ports';
export type { BugbotTelemetryPort } from './application/ports/bugbot_telemetry_ports';
export type {
    BugbotReviewNavigation,
    BugbotReviewNavigationPort,
} from './application/ports/bugbot_review_navigation_ports';
export type { Result } from './data/model/result';
export type { BugbotFinding } from './domain/bugbot/finding';
export type { BugbotReviewConfiguration } from './domain/bugbot/review_configuration';
export type { BugbotReviewTelemetrySnapshot } from './application/ports/bugbot_telemetry_ports';
export type {
    BugbotFindingState,
    BugbotFindingStateCounts,
    BugbotFindingEvidence,
    BugbotResolvedFindingState,
} from './domain/bugbot/review_state';
export type {
    BugbotProjectedFinding,
    BugbotProjectionOutcome,
    BugbotReviewProjection,
} from './domain/bugbot/review_projection';
export type {
    PullRequestReviewReference,
    PullRequestReviewSummary,
    PullRequestReviewSummaryQueryPort,
    PullRequestReviewSummaryUpdatePort,
} from './application/ports/pull_request_review_comment_ports';
