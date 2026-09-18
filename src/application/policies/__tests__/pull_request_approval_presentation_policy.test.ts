import { renderApprovalAssessment, renderApprovalRunSummary } from '../pull_request_approval_presentation_policy';
import type { ApprovalDecision, ApprovalEvidence } from '../../../domain/pull_request_approval';

const target = { owner: 'owner', repository: 'repo', repositoryId: 17, pullNumber: 42 };
const evidence = {
  headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40),
  checks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check',
    headSha: 'a'.repeat(40), status: 'completed', conclusion: 'success', runId: 8, attempt: 1 }],
  bugbot: { headSha: 'a'.repeat(40), outcome: 'complete', coverage: 'complete' },
} as unknown as ApprovalEvidence;

function card(status: ApprovalDecision['status'], code: string, locale = 'en-US', detail = 'Waiting for CI.') {
  return renderApprovalAssessment({ target, evidence, decision: { status, code, detail }, locale });
}

describe('approval assessment presentation', () => {
  it.each([
    ['pending', 'check-missing', 'Waiting for evidence'],
    ['recommend', 'bot-author', 'Human review needed'],
    ['blocked', 'unsafe-rules', 'Approval blocked'],
    ['pending', 'publication-unknown', 'Publication outcome uncertain'],
    ['already-approved', 'approved', 'Approved by the bot'],
  ] as const)('renders the %s state with one clear action', (status, code, label) => {
    const body = card(status, code);
    expect(body).toContain(label);
    expect(body).toContain('**Action required:**');
    expect(body).toContain('**Impact:**');
    expect(body).toContain('See checks');
    expect(body.length).toBeLessThanOrEqual(1800);
  });

  it('uses Spanish for the PR locale and English for unsupported locales', () => {
    const spanish = card('recommend', 'bot-author', 'es-ES', 'A human must review pull requests opened by a bot.');
    expect(spanish).toContain('Revisión humana necesaria');
    expect(spanish).toContain('Una persona debe revisar');
    expect(spanish).not.toContain('A human must review');
    expect(card('recommend', 'bot-author', 'fr-FR')).toContain('Human review needed');
  });

  it('neutralizes Markdown, HTML, and mentions from reason text', () => {
    const body = card('blocked', 'check-source', 'en-US', '@alice <script> **bad**');
    expect(body).not.toContain('@alice');
    expect(body).not.toContain('<script>');
    expect(body).toContain('@\u200balice');
  });

  it('shows retained native approval and source-bound run evidence in the summary', () => {
    const decision = { status: 'already-approved' as const, code: 'approved', detail: 'Approved.' };
    const summary = renderApprovalRunSummary({ target, evidence, decision, reviewId: 71,
      mode: 'guarded', publication: 'failed', wakeup: 'workflow_run', locale: 'es-ES' });
    expect(summary).toContain('Revisión nativa: 71');
    expect(summary).toContain('App 15368');
    expect(summary).not.toContain('Card/Check: failed');
    expect(summary).toContain('Tarjeta/Check: failed');
  });
});
