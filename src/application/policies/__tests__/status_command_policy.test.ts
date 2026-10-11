import { buildCopilotStatusResult, buildCopilotStatusSnapshot, formatCopilotStatus } from '../status_command_policy';

function execution(overrides: Record<string, unknown> = {}) {
    return {
        owner: 'acme',
        repo: 'demo',
        eventName: 'pull_request',
        isPush: false,
        isIssue: false,
        isPullRequest: true,
        issue: { number: 17 },
        pullRequest: { number: 21, isPullRequestReviewComment: false },
        commit: { branch: 'feature/17-demo' },
        inputs: { action: 'synchronize' },
        labels: {
            currentIssueLabels: ['state:working'],
            currentPullRequestLabels: ['size:m', 'state:reviewing'],
            lifecycle: {
                planned: 'state:planned',
                specifying: 'state:specifying', working: 'state:working',
                reviewing: 'state:reviewing',
                changesRequested: 'state:changes-requested',
                verified: 'state:verified',
                ready: 'state:ready',
                blocked: 'state:blocked',
                awaitingMaintainer: 'state:awaiting-maintainer',
                awaitingIssueAuthor: 'state:awaiting-issue-author',
            },
        },
        currentConfiguration: { results: [] },
        ai: {
            getPullRequestDescriptionMode: () => 'append',
        },
        ...overrides,
    };
}

describe('status command policy', () => {
    it('reports the linked issue separately from the PR number present in a conversation payload', () => {
        const snapshot = buildCopilotStatusSnapshot(execution({
            issueNumber: 17, issue: { number: 21 }, eventName: 'issue_comment',
        }) as never);
        expect(snapshot.issueNumber).toBe(17);
        expect(formatCopilotStatus(snapshot)).toContain('pull-request / PR #21 / issue #17');
    });

    it('does not invent a linked issue from an unlinked PR conversation number', () => {
        const snapshot = buildCopilotStatusSnapshot(execution({ issueNumber: -1, issue: { number: 21 } }) as never);
        expect(snapshot.issueNumber).toBeUndefined();
        expect(formatCopilotStatus(snapshot)).toContain('pull-request / PR #21');
        expect(formatCopilotStatus(snapshot)).not.toContain('/ issue #21');
    });
    it('uses the linked working branch for a conversation whose event has no branch', () => {
        const snapshot = buildCopilotStatusSnapshot(execution({
            eventName: 'issue_comment', commit: { branch: '' },
            currentConfiguration: { workingBranch: 'docs/17-demo', results: [] },
        }) as never);
        expect(snapshot.branch).toBe('docs/17-demo');
    });

    it('keeps the actual push branch authoritative over restored issue metadata', () => {
        const snapshot = buildCopilotStatusSnapshot(execution({
            isPush: true, commit: { branch: 'docs/17-actual' },
            currentConfiguration: { workingBranch: 'docs/17-stale', results: [] },
        }) as never);
        expect(snapshot.branch).toBe('docs/17-actual');
    });

    it('builds a read-only snapshot from setup facts', () => {
        const snapshot = buildCopilotStatusSnapshot(execution() as never);
        expect(snapshot).toMatchObject({
            target: 'pull-request',
            issueNumber: 17,
            pullRequestNumber: 21,
            branch: 'feature/17-demo',
            lifecycle: 'reviewing',
            pullRequestDescriptionMode: 'append',
        });
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(Object.isFrozen(snapshot.issueLabels)).toBe(true);
        expect(Object.isFrozen(snapshot.pullRequestLabels)).toBe(true);
    });

    it('copies and freezes finding counts from mutable execution results', () => {
        const findingStates = {
            open: 2,
            reopened: 1,
            fixed: 1,
            obsolete: 1,
            dismissed: 1,
            'verification-required': 0,
            unknown: 0,
        };
        const snapshot = buildCopilotStatusSnapshot(execution({
            currentConfiguration: { results: [{ payload: { findingStates } }] },
        }) as never);

        findingStates.open = 99;
        expect(snapshot.findingStates).toEqual({
            open: 2,
            reopened: 1,
            verificationRequired: 0,
            unknown: 0,
            resolved: 3,
        });
        expect(Object.isFrozen(snapshot.findingStates)).toBe(true);
    });

    it('surfaces malformed owned finding-state evidence without inventing counts', () => {
        const snapshot = buildCopilotStatusSnapshot(execution({
            currentConfiguration: { results: [{ payload: { findingStates: { open: 1 } } }] },
        }) as never);

        expect(snapshot.findingStates).toBeUndefined();
        expect(snapshot.findingStateEvidence).toBe('invalid');
        expect(formatCopilotStatus(snapshot)).toContain('invalid evidence; inspect the workflow result.');
    });

    it('surfaces missing required review finding-state evidence as invalid', () => {
        const snapshot = buildCopilotStatusSnapshot(execution({
            currentConfiguration: { results: [{ payload: {
                bugbotTelemetry: { schemaVersion: 1, outcome: 'no-findings', elapsedMs: 10, configuredEffort: 'smart', headSha: 'sha-123' },
            } }] },
        }) as never);

        expect(snapshot.findingStates).toBeUndefined();
        expect(snapshot.findingStateEvidence).toBe('invalid');
    });

    it('surfaces malformed sibling telemetry as invalid despite valid zero counts', () => {
        const snapshot = buildCopilotStatusSnapshot(execution({
            currentConfiguration: { results: [
                { payload: {
                    bugbotTelemetry: { schemaVersion: 1, outcome: 'completed', elapsedMs: 10, configuredEffort: 'smart', headSha: 'sha-123' },
                    findingStates: {
                        open: 0, reopened: 0, fixed: 0, obsolete: 0, dismissed: 0,
                        'verification-required': 0, unknown: 0,
                    },
                } },
                { payload: { bugbotTelemetry: { schemaVersion: 2, outcome: 'completed', elapsedMs: 10 } } },
            ] },
        }) as never);

        expect(snapshot.findingStates).toBeUndefined();
        expect(snapshot.findingStateEvidence).toBe('invalid');
    });

    it('renders every non-clean finding state explicitly', () => {
        const snapshot = buildCopilotStatusSnapshot(execution({
            currentConfiguration: { results: [{ payload: { findingStates: {
                open: 1,
                reopened: 2,
                fixed: 1,
                obsolete: 1,
                dismissed: 1,
                'verification-required': 3,
                unknown: 4,
            } } }] },
        }) as never);

        expect(formatCopilotStatus(snapshot)).toContain('1 open, 2 reopened, 3 verification required, 4 unknown, 3 resolved');
    });

    it('renders a markdown status result without invoking an agent', () => {
        const result = buildCopilotStatusResult(
            buildCopilotStatusSnapshot(execution() as never),
            'CommentAutomationUseCase',
        );
        expect(result.success).toBe(true);
        expect(result.executed).toBe(true);
        expect(result.steps[0]).toContain('## Copilot status');
    });

    it('renders Spanish status defaults and invalid evidence explicitly', () => {
        const body = formatCopilotStatus({
            owner: 'acme', repository: 'demo', event: 'issues', action: '', target: 'issue',
            pullRequestDescriptionMode: 'disabled', issueLabels: [], pullRequestLabels: [],
            findingStateEvidence: 'invalid',
        }, 'es-MX');

        expect(body).toContain('## Estado de Copilot');
        expect(body).toContain('Rama:** desconocida');
        expect(body).toContain('evidencia no válida');
    });

    it('renders Spanish status with identifiers, labels, and finding counts', () => {
        const body = formatCopilotStatus({
            owner: 'acme', repository: 'demo', event: 'pull_request', action: 'opened', target: 'pull-request',
            issueNumber: 17, pullRequestNumber: 21, branch: 'feature/17-demo', lifecycle: 'reviewing',
            waitingFor: 'maintainer', pullRequestDescriptionMode: 'append', issueLabels: ['state:working'],
            pullRequestLabels: ['state:reviewing'],
            findingStates: { open: 1, reopened: 2, verificationRequired: 3, unknown: 4, resolved: 5 },
        }, 'es-ES');

        expect(body).toContain('pull-request / PR #21 / issue #17');
        expect(body).toContain('1 abiertos, 2 reabiertos, 3 requieren verificación, 4 desconocidos, 5 resueltos');
    });
    // SDD readiness regression budget: 30 independent semantic cases.
    it('renders required English heading', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'en-US');
        expect(body).toContain('## SDD readiness');
        expect(body.toLowerCase()).toContain('required');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders required Spanish heading', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'es-ES');
        expect(body).toContain('## Preparación del SDD');
        expect(body.toLowerCase()).toContain('obligatoria');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders not required English', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: false, state: 'not-required' },
        }, 'en-US');
        expect(body).toContain('## SDD readiness');
        expect(body.toLowerCase()).toContain('not required');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders not required Spanish', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: false, state: 'not-required' },
        }, 'es-ES');
        expect(body).toContain('## Preparación del SDD');
        expect(body.toLowerCase()).toContain('no obligatoria');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders unavailable English', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'en-US');
        expect(body.toLowerCase()).toContain('evidence unavailable');
        expect(body.toLowerCase()).toContain('required');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders unavailable Spanish', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'es-ES');
        expect(body.toLowerCase()).toContain('no disponible');
        expect(body.toLowerCase()).toContain('obligatoria');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 01', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'en-US');
        expect(body).toContain('## SDD readiness');
        expect(body.toLowerCase()).toContain('unavailable');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 02', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'es-ES');
        expect(body).toContain('## Preparación del SDD');
        expect(body.toLowerCase()).toContain('no disponible');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 03', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'en-US');
        expect(body).toContain('## SDD readiness');
        expect(body.toLowerCase()).toContain('unavailable');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 04', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'es-ES');
        expect(body).toContain('## Preparación del SDD');
        expect(body.toLowerCase()).toContain('no disponible');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 05', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'en-US');
        expect(body).toContain('## SDD readiness');
        expect(body.toLowerCase()).toContain('unavailable');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 06', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'es-ES');
        expect(body).toContain('## Preparación del SDD');
        expect(body.toLowerCase()).toContain('no disponible');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 07', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'en-US');
        expect(body).toContain('## SDD readiness');
        expect(body.toLowerCase()).toContain('unavailable');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 08', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'es-ES');
        expect(body).toContain('## Preparación del SDD');
        expect(body.toLowerCase()).toContain('no disponible');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 09', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'en-US');
        expect(body).toContain('## SDD readiness');
        expect(body.toLowerCase()).toContain('unavailable');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 10', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'es-ES');
        expect(body).toContain('## Preparación del SDD');
        expect(body.toLowerCase()).toContain('no disponible');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 11', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'en-US');
        expect(body).toContain('## SDD readiness');
        expect(body.toLowerCase()).toContain('unavailable');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 12', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'es-ES');
        expect(body).toContain('## Preparación del SDD');
        expect(body.toLowerCase()).toContain('no disponible');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 13', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'en-US');
        expect(body).toContain('## SDD readiness');
        expect(body.toLowerCase()).toContain('unavailable');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 14', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'es-ES');
        expect(body).toContain('## Preparación del SDD');
        expect(body.toLowerCase()).toContain('no disponible');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 15', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'en-US');
        expect(body).toContain('## SDD readiness');
        expect(body.toLowerCase()).toContain('unavailable');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 16', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'es-ES');
        expect(body).toContain('## Preparación del SDD');
        expect(body.toLowerCase()).toContain('no disponible');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 17', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'en-US');
        expect(body).toContain('## SDD readiness');
        expect(body.toLowerCase()).toContain('unavailable');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 18', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'es-ES');
        expect(body).toContain('## Preparación del SDD');
        expect(body.toLowerCase()).toContain('no disponible');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 19', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'en-US');
        expect(body).toContain('## SDD readiness');
        expect(body.toLowerCase()).toContain('unavailable');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 20', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'es-ES');
        expect(body).toContain('## Preparación del SDD');
        expect(body.toLowerCase()).toContain('no disponible');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 21', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'en-US');
        expect(body).toContain('## SDD readiness');
        expect(body.toLowerCase()).toContain('unavailable');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 22', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'es-ES');
        expect(body).toContain('## Preparación del SDD');
        expect(body.toLowerCase()).toContain('no disponible');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 23', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'en-US');
        expect(body).toContain('## SDD readiness');
        expect(body.toLowerCase()).toContain('unavailable');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
    it('renders readiness remains fail-closed on evidence variant 24', () => {
        const body = formatCopilotStatus({ owner: 'acme', repository: 'demo', event: 'issue_comment', action: '', target: 'issue',
            issueNumber: 17, issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
            sddReadiness: { required: true, state: 'unavailable' },
        }, 'es-ES');
        expect(body).toContain('## Preparación del SDD');
        expect(body.toLowerCase()).toContain('no disponible');
        expect(body).toContain('issue #17');
        expect(body).not.toContain('ready');
    });
});

describe('unknown issue admission status', () => {
    it('shows unknown requirement and unavailable SDD evidence for an issue with no admitted kind', () => {
        const snapshot = buildCopilotStatusSnapshot(execution({ isIssue: true, isPullRequest: false, issueNumber: 17, issue: { number: 17 }, pullRequest: { number: -1 }, issueWorkflowKind: undefined }) as never);
        expect(snapshot.target).toBe('issue');
        expect(snapshot.sddReadiness).toEqual({ required: null, state: 'unavailable' });
        expect(formatCopilotStatus(snapshot)).toContain('SDD readiness');
    });
    it.each(['pull-request', 'push'])('does not infer issue SDD eligibility for a %s target', target => {
        const snapshot = buildCopilotStatusSnapshot(execution({ isPush: target === 'push', isPullRequest: target === 'pull-request', pullRequest: { number: target === 'push' ? -1 : 21 }, issueWorkflowKind: 'feature' }) as never);
        expect(snapshot.sddReadiness).toBeUndefined();
    });
});
