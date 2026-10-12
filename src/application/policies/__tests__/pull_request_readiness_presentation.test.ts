import { formatCopilotStatus, type CopilotStatusSnapshot } from '../status_command_policy';
import { projectPullRequestReadiness, unavailablePullRequestReadiness } from '../pull_request_readiness_policy';
import { readinessFixture, readinessEvidence, readinessPolicy, READINESS_HEAD, READINESS_BASE } from '../../usecases/__tests__/fixtures/pr_readiness_fixture';
function snapshot() {
    const raw=readinessPolicy('recommend');
    return { ...readinessFixture().context.status, serverOrigin: 'https://github.com', pullRequestReadiness: {
        ...projectPullRequestReadiness(raw,readinessEvidence(),{repositoryId:1,pullNumber:11,headSha:READINESS_HEAD,baseSha:READINESS_BASE,rawPolicy:raw}),pullNumber:11,
    } } as CopilotStatusSnapshot;
}
describe('localized, bounded readiness status',()=>{
    it.each(['unavailable','pending','blocked','satisfied','not-applicable'] as const)('gives %s a textual state rather than an icon-only status',(state)=>{
        const s=snapshot();const text=formatCopilotStatus({...s,pullRequestReadiness:{...s.pullRequestReadiness!,readiness:state}});
        expect(text).toContain(state==='not-applicable'?'not applicable':state);expect(text.length).toBeLessThanOrEqual(6000);
    });
    it('shows independent evidence and one primary action in English',()=>{
        const text=formatCopilotStatus(snapshot(),'en-US');expect(text).toContain('**CI:** satisfied');expect(text).toContain('**Coverage:** satisfied');
        expect(text).toContain('**Native reviews:** satisfied');expect(text.match(/Next action:/gu)).toHaveLength(1);expect(text).toContain('A human review is still required');
    });
    it('keeps independent readiness when finding counts are unavailable and offers one action',()=>{
        const text=formatCopilotStatus({...snapshot(),findingStates:undefined,findingStateEvidence:'invalid'});
        expect(text).toContain('Current finding counts could not be verified.');
        expect(text).toContain('**CI:** satisfied'); expect(text.match(/Next action:/gu)).toHaveLength(1);
        expect(text).not.toContain('/copilot recheck');
    });
    it('keeps the Spanish report and action entirely in the Spanish catalog',()=>{
        const text=formatCopilotStatus(snapshot(),'es-ES');expect(text).toContain('**Cobertura:** cumplida');expect(text).toContain('Revisiones de GitHub');
        expect(text).toContain('Siguiente acción:');expect(text).not.toContain('Next action');expect(text).not.toContain('Native reviews');
    });
    it.each(['en-US','es-ES'])('does not display an asserted human-review requirement for unavailable evidence in %s',locale=>{
        const s=snapshot();const text=formatCopilotStatus({...s,pullRequestReadiness:{...s.pullRequestReadiness!,readiness:'unavailable',action:'retry'}},locale);
        expect(text).not.toContain('A human review is still required');expect(text).not.toContain('Aún se requiere revisión humana');
        expect(text).toContain(locale==='es-ES'?'Siguiente acción:':'Next action:');
    });
    it('falls back atomically for an unsupported locale',()=>{
        const text=formatCopilotStatus(snapshot(),'fr-FR');expect(text).toContain('Next action');expect(text).toContain('Native reviews');expect(text).not.toContain('Siguiente acción');
    });
    it('uses a trusted configured GitHub Enterprise origin',()=>{
        expect(formatCopilotStatus({...snapshot(),serverOrigin:'https://github.example.test'})).toContain('(https://github.example.test/o/r/pull/11)');
    });
    it('suppresses a credential-bearing source rather than exposing it',()=>{
        const text=formatCopilotStatus({...snapshot(),serverOrigin:'https://secret@github.com'});expect(text).not.toContain('https://secret');expect(text).not.toContain('View verified PR');
    });
    it('does not construct a link from an unsafe repository path',()=>{
        expect(formatCopilotStatus({...snapshot(),repository:'../other'})).not.toContain('View verified PR');
    });
    it('neutralizes untrusted status code and revision prose',()=>{
        const s=snapshot();const text=formatCopilotStatus({...s,pullRequestReadiness:{...s.pullRequestReadiness!,headSha:'@everyone',code:'[credential](https://evil.test)'}});
        expect(text).not.toContain('@everyone');expect(text).not.toContain('evil.test');expect(text).toContain('evidence-unavailable');
    });
    it('renders an unrecognized evidence state as unavailable without reflecting provider prose',()=>{
        const s=snapshot();const text=formatCopilotStatus({...s,pullRequestReadiness:{...s.pullRequestReadiness!,readiness:'@everyone' as never,evidence:{...s.pullRequestReadiness!.evidence!,ci:'satisfied-by-name' as never}}});
        expect(text).toContain('**Exact-head PR readiness:** unavailable');expect(text).toContain('**CI:** unavailable');
        expect(text).not.toContain('@everyone');expect(text).not.toContain('satisfied-by-name');
        expect(text).not.toContain('A human review is still required');
    });
    it('renders an unrecognized policy mode as unavailable without inventing approval authority',()=>{
        const s=snapshot();const text=formatCopilotStatus({...s,pullRequestReadiness:{...s.pullRequestReadiness!,mode:'auto-approve' as never}});
        expect(text).toContain('(unavailable;');expect(text).not.toContain('auto-approve');
        expect(text).not.toContain('A human review is still required');
    });
    it('turns an unknown action into a safe localized retry',()=>{
        const s=snapshot();const text=formatCopilotStatus({...s,pullRequestReadiness:{...s.pullRequestReadiness!,action:'@everyone' as never}});
        expect(text).not.toContain('@everyone');expect(text).toContain('Inspect this run and retry status.');
    });
    it('replaces an oversized report with unavailable evidence and one bounded recovery',()=>{
        const text=formatCopilotStatus({...snapshot(),issueLabels:['x'.repeat(6500)]});expect(text.length).toBeLessThanOrEqual(6000);
        expect(text).toContain('current readiness is unavailable');expect(text).not.toContain('satisfied');
    });
    it('makes ambiguous native links actionable in the selected PR conversation',()=>{
        const text=formatCopilotStatus({...snapshot(),pullRequestReadiness:unavailablePullRequestReadiness('ambiguous-linkage','select-pr')});
        expect(text).toContain('Run /copilot status in the selected PR conversation.');expect(text).not.toContain('satisfied');
    });
});
