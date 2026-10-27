import { runCheckChangesIssueSize, type CheckChangesIssueSizeDependencies } from '../check_changes_issue_size_workflow';
import { withChangeSizeDiagnostics } from '../../../../../infrastructure/composition/change_size_diagnostics_composition_root';
import type { ChangeSizeContext } from '../../../push_single_action_contexts';
import { CHANGE_SIZE_OPERATIONS, type ChangeSizeOperation } from '../../../../../domain/change_size_reconciliation';
import { ApplicationError } from '../../../../errors/application_error';
import { ChangeSizeReconciliation } from '../change_size_reconciliation';
import { renderApplicationErrorText, renderApplicationErrorMarkdown } from '../../../../policies/application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../../../../policies/application_error_message_catalog';

function fixture(fault?: ChangeSizeOperation, ambiguous = false) {
    let failNext = fault;
    const labels = new Map([[42, ['bug', 'size: S']], [99, ['bug', 'size: S']], [100, ['bug', 'size: S']]]);
    const sizes = new Map<number, string>();
    const labelMutations: number[] = [];
    const sizeMutations: number[] = [];
    const performed: string[] = [];
    async function call<T>(operation: ChangeSizeOperation, perform: () => T): Promise<T> {
        performed.push(operation);
        if (failNext === operation) {
            failNext = undefined;
            if (ambiguous) perform();
            throw { status: 503, message: 'secret', response: { headers: { 'x-github-request-id': 'ABCD:1234' }, data: 'secret' } };
        }
        return perform();
    }
    const dependencies: CheckChangesIssueSizeDependencies = {
        branchChangeSizePort: { getSizeCategoryAndReason: () => call('calculate-size', () => ({ size: 'size: L', githubSize: 'L', reason: 'Many lines' })) },
        issueRepository: {
            getLabels: number => call('pr-label-read', () => [...labels.get(number)!]),
            setLabels: (number, next) => call(number === 42 ? 'issue-labels' : 'pr-label-write', () => {
                labels.set(number, [...next]); labelMutations.push(number);
            }),
        },
        projectBoardCommandPort: {
            setTaskPriority: jest.fn(), moveIssueToColumn: jest.fn(),
            setTaskSize: (_project, number, size) => call(number === 42 ? 'issue-project-size' : 'pr-project-size', () => {
                if (sizes.get(number) === size) return false;
                sizes.set(number, size); sizeMutations.push(number); return true;
            }),
        },
        pullRequestRepository: { getOpenPullRequestNumbersByHeadBranch: () => call('list-pull-requests', () => [99]) },
        projectMembershipQueryPort: { isContentLinked: () => call('pr-project-membership', () => true) },
    };
    let projects = [{ id: 'project', title: 'Delivery', type: 'organization', owner: 'owner', url: 'https://github.com/orgs/owner/projects/1', number: 1 }];
    async function run() {
        const context = { issueNumber: 42, headBranch: 'bugfix/42', baseBranch: 'develop',
            thresholds: {} as ChangeSizeContext['thresholds'], labels: { xs: 'size: XS', s: 'size: S', m: 'size: M', l: 'size: L', xl: 'size: XL', xxl: 'size: XXL' }, currentIssueLabels: labels.get(42)!, currentSize: labels.get(42)![1], projects } as ChangeSizeContext;
        return (await runCheckChangesIssueSize(context, 'size', withChangeSizeDiagnostics(dependencies)))[0];
    }
    return { dependencies, run, labels, sizes, labelMutations, sizeMutations, performed, noProjects: () => { projects = []; } };
}

describe('size reconciliation fault injection and replay', () => {
    it.each(CHANGE_SIZE_OPERATIONS)('identifies %s and completes only missing effects on fresh replay', async operation => {
        const h = fixture(operation);
        const result = await h.run();
        expect(result).toMatchObject({ id: 'size', success: false, executed: true });
        const error = result.errors[0];
        const variables = { operation, issueNumber: 42,
            targetNumber: operation.startsWith('pr-') ? 99 : 42,
            projectIndex: operation.includes('project') ? 1 : 0,
            verifiedOperations: CHANGE_SIZE_OPERATIONS.indexOf(operation), pendingProjectSizes: 0,
            providerStatus: 'http-503', providerReference: 'ABCD:1234' };
        expect(error).toMatchObject({ code: 'provider.unavailable', retryable: true, recovery: { id: 'change-size-reconciliation-failed', variables } });
        expect(result.payload).toEqual({ changeSize: { reconciliation: error.recovery } });
        expect(h.performed).toHaveLength(CHANGE_SIZE_OPERATIONS.indexOf(operation) + 1);
        expect(JSON.stringify(result)).not.toContain('secret');
        expect((await h.run()).success).toBe(true);
        expect(h.labels.get(42)).toEqual(['bug', 'size: L']);
        expect(h.labels.get(99)).toEqual(['bug', 'size: L']);
        expect(h.sizes).toEqual(new Map([[42, 'L'], [99, 'L']]));
        expect(h.labelMutations).toEqual([42, 99]);
        expect(h.sizeMutations).toEqual([42, 99]);
    });

    it.each(['issue-labels', 'issue-project-size', 'pr-label-write', 'pr-project-size'] as const)('rereads an ambiguous applied %s without duplicate effects', async operation => {
        const h = fixture(operation, true);
        expect((await h.run()).success).toBe(false);
        expect((await h.run()).success).toBe(true);
        expect(h.labelMutations).toEqual([42, 99]);
        expect(h.sizeMutations).toEqual([42, 99]);
    });

    it('retains verified pending linkage when a later PR fails without claiming its size complete', async () => {
        const h = fixture();
        h.dependencies.pullRequestRepository.getOpenPullRequestNumbersByHeadBranch = async () => [99, 100];
        h.dependencies.projectMembershipQueryPort.isContentLinked = async () => false;
        h.dependencies.issueRepository.getLabels = async number => {
            if (number === 100) throw { status: 403 };
            return [...h.labels.get(number)!];
        };
        const result = await h.run();
        expect(result.errors[0]).toMatchObject({ code: 'authorization.denied', retryable: false,
            recovery: { variables: { operation: 'pr-label-read', targetNumber: 100, pendingProjectSizes: 1 } } });
        expect(h.sizes.has(99)).toBe(false);
        expect(h.sizes.has(100)).toBe(false);
        expect(h.labels.get(99)).toContain('size: L');
    });

    it('reconciles without Project authority when no Projects are configured', async () => {
        const h = fixture(); h.noProjects();
        expect((await h.run()).success).toBe(true);
        expect(h.performed).not.toContain('pr-project-membership');
        expect(h.sizes.size).toBe(0);
    });

    it('preserves an explicitly nonretryable semantic error and correlation through operation context', async () => {
        const tracker = new ChangeSizeReconciliation(42);
        const cause = new ApplicationError('provider.unavailable', 'safe', { retryable: false });
        await expect(tracker.run('issue-labels', 42, 0, async () => { throw cause; })).rejects.toMatchObject({
            code: cause.code, retryable: false, correlationId: cause.correlationId,
            recovery: { variables: { operation: 'issue-labels', providerStatus: 'http-unavailable' } },
        });
    });

    it('keeps an unclassified application failure nonretryable and sanitized', async () => {
        const tracker = new ChangeSizeReconciliation(42);
        await expect(tracker.run('calculate-size', 42, 0, async () => { throw new Error('secret'); }))
            .rejects.toMatchObject({ code: 'unexpected', retryable: false });
    });

    it.each(['en-US', 'es-ES', 'fr-FR'])('presents operation, retained and unknown state in %s without raw provider data', async locale => {
        const h = fixture('pr-project-size');
        const result = await h.run();
        const error = result.errors[0];
        const catalog = resolveStaticApplicationErrorCatalog(locale);
        for (const rendered of [renderApplicationErrorText(error, catalog.message), renderApplicationErrorMarkdown(error, catalog.message)]) {
            for (const expected of ['pr-project-size', '#99', '#42', 'http-503', 'ABCD:1234', error.correlationId]) expect(rendered).toContain(expected);
            expect(rendered).not.toContain('secret');
            expect(rendered).toMatch(locale === 'es-ES' ? /sin verificar/ : /unverified/);
        }
    });
});
