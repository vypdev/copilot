import { buildActionSummary } from '../action_summary_policy';
import { Result } from '../../../data/model/result';
const render = (results: Result[], locale = 'en-US') => buildActionSummary({ owner: 'o', repository: 'r', eventName: 'issues',
    issueNumber: 42, pullRequestNumber: -1, results, locale: { repository: locale, issue: locale, pullRequest: locale } });
const completion = { nativeClosed: true, reconciled: true, outcome: 'already-converged' };
it('omits cleanup claims for unrelated results', () => {
    expect(render([new Result({ id: 'unrelated', success: true, executed: false, payload: completion })])).not.toContain('Issue cleanup');
});
it('shows an explicit freshly verified duplicate completion', () => {
    const summary = render([new Result({ id: 'ReconcileClosedIssueMetadataUseCase', success: true, executed: false, payload: { issueCompletion: completion } })]);
    expect(summary).toContain('Already converged: 1'); expect(summary).toContain('freshly verified');
});
it('counts independent verified card repair and metadata convergence in Spanish', () => {
    const summary = render([new Result({ id: 'ReconcileClosedIssueMetadataUseCase', success: true, executed: false, payload: { issueCompletion: completion } }),
        new Result({ id: 'RetireProgressUseCase', success: true, executed: true, payload: { ...completion, outcome: 'reconciled' } })], 'es-ES');
    expect(summary).toContain('Limpieza de la issue'); expect(summary).toContain('Reconciliadas: 1 · Ya convergidas: 1');
});
it('withholds completion when any independent cleanup result failed', () => {
    const summary = render([new Result({ id: 'ReconcileClosedIssueMetadataUseCase', success: true, executed: false, payload: { issueCompletion: completion } }),
        new Result({ id: 'RetireProgressUseCase', success: false, executed: true })]);
    expect(summary).toContain('| Issue cleanup | unavailable |'); expect(summary).not.toContain('freshly verified');
});
it.each([{ ...completion, nativeClosed: false }, { ...completion, reconciled: false }, { ...completion, outcome: '<script> @everyone' }])('rejects unverified completion projections (%j)', payload => {
    const summary = render([new Result({ id: 'RetireProgressUseCase', success: true, executed: false, payload })]);
    expect(summary).toContain('| Issue cleanup | unavailable |'); expect(summary).not.toContain('<script>');
});
it('does not advertise a skipped unbound or reopened subject as closed cleanup', () => {
    const summary = render([new Result({ id: 'CloseIssueAfterMergingUseCase', success: true, executed: false }),
        new Result({ id: 'RetireProgressUseCase', success: true, executed: false, payload: { nativeClosed: false, outcome: 'not-applicable' } })]);
    expect(summary).not.toContain('Issue cleanup');
});
