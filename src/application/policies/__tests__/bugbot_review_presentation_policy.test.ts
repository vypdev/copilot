import { buildBugbotReviewProjection } from '../../../domain/bugbot/review_projection';
import type { BugbotFindingState } from '../../../domain/bugbot/review_state';
import {
  BUGBOT_REVIEW_STATUS_END,
  buildBugbotStatusMarker,
  buildNewBugbotReviewSnapshotHeader,
  isBugbotStatusComment,
  normalizeBugbotPresentationLocale,
  renderBugbotReviewSnapshot,
  renderBugbotStatusCard,
} from '../bugbot_review_presentation_policy';

const head = 'a'.repeat(40);
const links = {
  pullRequestUrl: 'https://github.com/org/repo/pull/358',
  commitUrl: `https://github.com/org/repo/commit/${head}`,
  runUrl: 'https://github.com/org/repo/actions/runs/1',
};

function projection(states: BugbotFindingState[] = []) {
  return buildBugbotReviewProjection({
    pullRequestNumber: 358,
    analyzedHeadSha: head,
    findings: states.map((state, index) => ({
      id: `finding-${index}`,
      title: `Finding ${index}`,
      state,
      url: `https://github.com/org/repo/pull/358#discussion_r${index}`,
    })),
  });
}

describe('Bugbot review presentation', () => {
  it.each([
    ['es-ES', 'es-ES'],
    ['ES-es', 'es-ES'],
    ['en-US', 'en-US'],
    ['fr-FR', 'en-US'],
    ['', 'en-US'],
  ] as const)('normalizes locale %s', (locale, expected) => {
    expect(normalizeBugbotPresentationLocale(locale)).toBe(expected);
  });

  it('renders one complete clean status card with navigation and no-action copy', () => {
    const body = renderBugbotStatusCard(projection(['fixed']), 'en-US', links);
    expect(body).toContain('## 🤖 Bugbot status');
    expect(body).toContain('No active findings');
    expect(body).toContain('No action required');
    expect(body).toContain('[Verified commit]');
    expect(body).toContain('| Fixed | 1 |');
    expect(isBugbotStatusComment(body)).toBe(true);
  });

  it('renders actionable and verification-required states without relying on emoji', () => {
    const body = renderBugbotStatusCard(
      projection(['open', 'verification-required']),
      'en-US',
      links,
    );
    expect(body).toContain('2 finding(s) require attention');
    expect(body).toContain('/copilot fix all');
    expect(body).toContain('| Verification required | 1 |');
  });

  it('renders unknown state as explicit recovery work', () => {
    const body = renderBugbotStatusCard(projection(['unknown']), 'en-US', links);
    expect(body).toContain('unknown state');
    expect(body).toContain('/copilot recheck');
  });

  it('renders Spanish product copy while keeping machine markers neutral', () => {
    const body = renderBugbotStatusCard(projection(['fixed']), 'es-ES', links);
    expect(body).toContain('## 🤖 Estado de Bugbot');
    expect(body).toContain('No se requiere ninguna acción');
    expect(body).toContain('copilot-bugbot-status schema="1"');
  });

  it('renders Spanish recovery and actionable copy', () => {
    expect(renderBugbotStatusCard(projection(['unknown']), 'es-ES', links)).toContain(
      'estado desconocido',
    );
    expect(renderBugbotStatusCard(projection(['reopened']), 'es-ES', links)).toContain(
      'requieren atención',
    );
  });

  it('renders partial synchronization in both locales with sanitized details', () => {
    const partial = buildBugbotReviewProjection({
      pullRequestNumber: 358,
      analyzedHeadSha: head,
      findings: [{ id: 'fixed', state: 'fixed' }],
      errors: ['@team <!-- unsafe -->'],
    });
    const english = renderBugbotStatusCard(partial, 'en-US', links);
    const spanish = renderBugbotStatusCard(partial, 'es-ES', links);
    expect(english).toContain('could not fully synchronize');
    expect(spanish).toContain('no pudo sincronizar por completo');
    expect(english).not.toContain('<!-- unsafe -->');
    expect(english).toContain('@​team');
  });

  it('renders empty and long finding lists without requiring a workflow-run link', () => {
    const noRunLinks = { pullRequestUrl: links.pullRequestUrl, commitUrl: links.commitUrl };
    expect(renderBugbotStatusCard(projection(), 'es-ES', noRunLinks)).toContain(
      'No hay hallazgos registrados',
    );
    const long = buildBugbotReviewProjection({
      pullRequestNumber: 358,
      analyzedHeadSha: head,
      findings: Array.from({ length: 22 }, (_, index) => ({
        id: `finding-${index}`,
        state: index % 2 === 0 ? 'obsolete' as const : 'dismissed' as const,
      })),
    });
    const body = renderBugbotStatusCard(long, 'en-US', noRunLinks);
    expect(body).toContain('…and 2 more');
    expect(body).not.toContain('Workflow run');
    expect(body).toContain('[x] obsolete');
    expect(body).toContain('[x] dismissed');
  });

  it('rejects malformed and outdated status markers', () => {
    expect(isBugbotStatusComment('<!-- copilot-bugbot-status -->')).toBe(false);
    expect(isBugbotStatusComment(null)).toBe(false);
    expect(isBugbotStatusComment(buildBugbotStatusMarker(projection()))).toBe(true);
  });

  it('normalizes the mutable legacy review language into a historical snapshot', () => {
    const body = renderBugbotReviewSnapshot(
      '## 🤖 Bugbot review\n\nBugbot found **1** active potential problem(s) in this revision. 1 finding(s) are attached.\n\nTo request an automatic repair for all active findings, reply with `/copilot fix all`.',
      {
        reviewIdentity: '77',
        analyzedHeadSha: head,
        currentHeadSha: 'b'.repeat(40),
        projectionDigest: '12345678',
        findings: projection(['fixed']).findings,
        locale: 'en-US',
        statusUrl: links.pullRequestUrl,
      },
    );
    expect(body).toContain('All findings originating in this review are resolved');
    expect(body).toContain('Bugbot reported **1** potential problem');
    expect(body).toContain('Bugbot review snapshot');
    expect(body).not.toContain('active potential problem');
    expect(body).not.toContain('/copilot fix all');
  });

  it('replaces an existing status block idempotently', () => {
    const first = renderBugbotReviewSnapshot('## 🤖 Bugbot review snapshot\n\nHistory.', {
      reviewIdentity: '77',
      analyzedHeadSha: head,
      currentHeadSha: head,
      projectionDigest: '12345678',
      findings: projection(['open']).findings,
      locale: 'en-US',
      statusUrl: links.pullRequestUrl,
    });
    const second = renderBugbotReviewSnapshot(first, {
      reviewIdentity: '77',
      analyzedHeadSha: head,
      currentHeadSha: head,
      projectionDigest: '12345678',
      findings: projection(['open']).findings,
      locale: 'en-US',
      statusUrl: links.pullRequestUrl,
    });
    expect(second).toBe(first);
    expect(second.split(BUGBOT_REVIEW_STATUS_END)).toHaveLength(2);
  });

  it('renders active, unknown, and Spanish clean review status blocks', () => {
    const render = (states: BugbotFindingState[], locale: string, originalBody: string | null = null) =>
      renderBugbotReviewSnapshot(originalBody, {
        reviewIdentity: '77',
        analyzedHeadSha: head,
        currentHeadSha: head,
        projectionDigest: '12345678',
        findings: projection(states).findings,
        locale,
        statusUrl: links.pullRequestUrl,
      });
    expect(render(['open'], 'en-US')).toContain('require attention');
    expect(render(['open'], 'es-ES')).toContain('requieren atención');
    expect(render(['unknown'], 'en-US')).toContain('could not be verified');
    expect(render(['unknown'], 'es-ES')).toContain('No se pudo verificar');
    expect(render(['fixed'], 'es-ES', 'Historical detail.')).toContain(
      'Todos los hallazgos originados',
    );
    expect(render([], 'en-US', '')).toContain('## 🤖 Bugbot review snapshot');
  });

  it('never claims historical overflow is individually reconciled', () => {
    const original = [
      '## 🤖 Bugbot review snapshot',
      '',
      '### Additional findings omitted by the comment limit',
      '',
      '- Overflow finding',
    ].join('\n');
    const clean = renderBugbotReviewSnapshot(original, {
      reviewIdentity: '77',
      analyzedHeadSha: head,
      currentHeadSha: head,
      projectionDigest: '12345678',
      findings: projection(['fixed']).findings,
      locale: 'en-US',
      statusUrl: links.pullRequestUrl,
    });
    const active = renderBugbotReviewSnapshot(original, {
      reviewIdentity: '77',
      analyzedHeadSha: head,
      currentHeadSha: head,
      projectionDigest: '12345678',
      findings: projection(['open']).findings,
      locale: 'es-ES',
      statusUrl: links.pullRequestUrl,
    });
    expect(clean).toContain('No individually tracked finding');
    expect(clean).toContain('historical overflow without individual threads');
    expect(clean).not.toContain('All findings originating');
    expect(active).toContain('con seguimiento individual');
    expect(active).toContain('overflow histórico sin thread individual');
  });

  it('sanitizes titles before publishing them in the status card', () => {
    const unsafe = buildBugbotReviewProjection({
      pullRequestNumber: 358,
      analyzedHeadSha: head,
      findings: [{ id: 'x', state: 'open', title: '@team <!-- injected -->' }],
    });
    const body = renderBugbotStatusCard(unsafe, 'en-US', links);
    expect(body).not.toContain('@team');
    expect(body).not.toContain('<!-- injected -->');
    expect(body).toContain('@​team');
  });

  it('builds a historical header for new reviews in both locales', () => {
    expect(buildNewBugbotReviewSnapshotHeader(head, 2, 1, 'en-US')).toContain(
      'Bugbot reported **2**',
    );
    expect(buildNewBugbotReviewSnapshotHeader(head, 2, 1, 'es-ES')).toContain(
      'Bugbot reportó **2**',
    );
  });
});
