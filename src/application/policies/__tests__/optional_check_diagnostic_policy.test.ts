import { optionalCheckDiagnostic } from '../optional_check_diagnostic_policy';
import { resolveStaticActionSummaryCatalog } from '../action_summary_message_catalog';
import { CopilotEvidencePublicationError, COPILOT_EVIDENCE_FAILURE_CODES } from '../../ports/copilot_evidence_error';
import type { CopilotEvidence } from '../../ports/copilot_evidence_ports';
const head = 'a'.repeat(40);
const evidence: CopilotEvidence = { name: 'Copilot / Verification', headSha: head, conclusion: 'failure', title: 'PRIVATE_TITLE', summary: 'PRIVATE_SUMMARY' };
const catalog = resolveStaticActionSummaryCatalog('en-US');

it.each(COPILOT_EVIDENCE_FAILURE_CODES)('shows the closed %s cause with exact target and operation without copying evidence bodies', code => {
    const text = optionalCheckDiagnostic(evidence, 'dedicated-evidence-token', new CopilotEvidencePublicationError(code, 403, 'AB12:CD34'), catalog);
    expect(text).toContain('operation=checks.create'); expect(text).toContain('check=Copilot / Verification');
    expect(text).toContain(`head=${head}`); expect(text).toContain(`error=${code}`); expect(text).toContain('status=403; request=AB12:CD34');
    expect(text).toContain('workflow result'); expect(text).toContain('completed external effects were preserved');
    expect(text).not.toContain('PRIVATE_'); expect(text.length).toBeLessThan(3000);
});
it.each(['es-ES', 'es-MX', 'fr-FR'])('uses the atomic locale fallback for %s without invoking a provider', locale => {
    const text = optionalCheckDiagnostic(evidence, 'action-token-fallback', new CopilotEvidencePublicationError('provider.rate-limited'), resolveStaticActionSummaryCatalog(locale));
    expect(text).toContain(locale.startsWith('es') ? 'límite de peticiones' : 'rate limiting');
    expect(text).toContain('credential-route=action-token-fallback'); expect(text).not.toContain('{');
});
it('does not read or publish raw custom-adapter errors, bodies, credentials or claimed request ids', () => {
    const error = { message: 'PRIVATE_MESSAGE', status: 403, headers: { authorization: 'PRIVATE_TOKEN', 'x-github-request-id': 'PRIVATE_ID' }, response: { data: 'PRIVATE_BODY' } };
    const text = optionalCheckDiagnostic(evidence, 'action-token-fallback', error, catalog);
    expect(text).toContain('error=unexpected; status=unavailable; request=unavailable');
    expect(text).toContain('underlying cause is not established'); expect(text).not.toContain('PRIVATE');
});
it.each(['not-a-sha PRIVATE', '0'.repeat(40)])('never renders an invalid or null target as an immutable head: %s', headSha => {
    const text = optionalCheckDiagnostic({ ...evidence, headSha }, 'dedicated-evidence-token', null, catalog);
    expect(text).toContain('head=unavailable'); expect(text).not.toContain(headSha);
});
it('does not render arbitrary check names supplied by a broken custom adapter', () => {
    const text = optionalCheckDiagnostic({ ...evidence, name: 'PRIVATE_NAME\n::error::' as never }, 'action-token-fallback', null, catalog);
    expect(text).toContain('check=unavailable'); expect(text).not.toContain('PRIVATE_NAME'); expect(text).not.toContain('::error::');
});
it('retains a complete SHA-256 identity and the public check names', () => {
    for (const name of ['Copilot / Plan', 'Copilot / Review'] as const) {
        expect(optionalCheckDiagnostic({ ...evidence, name, headSha: 'b'.repeat(64) }, 'dedicated-evidence-token', null, catalog)).toContain(`check=${name}; head=${'b'.repeat(64)}`);
    }
});
it.each([99, 600, NaN, Infinity, 403.1, '403', null])('rejects malformed provider status %s at the closed port', status => {
    const error = new CopilotEvidencePublicationError('authorization.denied', status);
    expect(error.status).toBeUndefined(); expect(error.providerReference).toBeUndefined(); expect(Object.isFrozen(error)).toBe(true);
});
it.each(['ghp_PRIVATE', 'Bearer PRIVATE', 'AB12:CD34\n::error::PRIVATE', '<script>PRIVATE', 'abc', 'A:'.repeat(33), '', 'AB12：CD34', 'AB12:\u202eCD34', '`AB12:CD34`', 'A:A:A:A:A:A:A:A:A', 'A'.repeat(63)+':B'])('rejects unsafe request references %#', reference => {
    const error = new CopilotEvidencePublicationError('unexpected', 503, reference);
    expect(error.providerReference).toBeUndefined(); expect(JSON.stringify(error)).not.toContain(reference || 'PRIVATE');
});
it('rejects an unknown code rather than copying it into the public view', () => {
    const error = new CopilotEvidencePublicationError('PRIVATE_CODE' as never, 599, 'ab12:CD34');
    expect(error.code).toBe('unexpected'); expect(error.status).toBe(599); expect(error.providerReference).toBe('ab12:CD34');
    expect(JSON.stringify(error)).not.toContain('PRIVATE'); expect(error).not.toHaveProperty('cause');
});

it('retains the longest admitted request id and prevents later cause injection', () => {
    const reference = [...Array(7).fill('A'.repeat(7)), 'B'.repeat(8)].join(':');
    expect(reference).toHaveLength(64);
    const error = new CopilotEvidencePublicationError('unexpected', 100, reference);
    expect(error.providerReference).toBe(reference); expect(error.status).toBe(100);
    expect(Reflect.set(error, 'cause', 'PRIVATE_BODY')).toBe(false); expect(JSON.stringify(error)).not.toContain('PRIVATE');
});
