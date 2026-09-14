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
const completeCoverage = { status: 'complete' as const, sources: [] };
const links = {
  pullRequestUrl: 'https://github.com/org/repo/pull/358',
  commitUrl: `https://github.com/org/repo/commit/${head}`,
  runUrl: 'https://github.com/org/repo/actions/runs/1',
};

function projection(states: BugbotFindingState[] = []) {
  return buildBugbotReviewProjection({
    pullRequestNumber: 358,
    analyzedHeadSha: head,
    coverage: completeCoverage,
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
    expect(body).toContain('## Bugbot: review complete');
    expect(body).toContain('No active findings');
    expect(body).toContain('[Verified commit]');
    expect(body).not.toContain('### Findings');
    expect(body).not.toContain('### Coverage');
    expect(body).not.toContain('Technical details');
    expect(body).toContain('topic="bugbot" target="pr:358" key="aggregate"');
    expect(isBugbotStatusComment(body)).toBe(true);
  });

  it('renders actionable and verification-required states without relying on emoji', () => {
    const body = renderBugbotStatusCard(
      projection(['open', 'verification-required']),
      'en-US',
      links,
    );
    expect(body).toContain('2 findings need attention');
    expect(body).toContain('/copilot fix all');
    expect(body).toContain('[ ] verification-required');
  });

  it('renders unknown state as explicit recovery work', () => {
    const body = renderBugbotStatusCard(projection(['unknown']), 'en-US', links);
    expect(body).toContain('unknown state');
    expect(body).toContain('/copilot recheck');
  });

  it('renders Spanish product copy while keeping machine markers neutral', () => {
    const body = renderBugbotStatusCard(projection(['fixed']), 'es-ES', links);
    expect(body).toContain('## Bugbot: revisión completada');
    expect(body).toContain('No hay hallazgos activos');
    expect(body).toContain('copilot-bugbot-status schema="1"');
  });

  it('renders Spanish recovery and actionable copy', () => {
    expect(renderBugbotStatusCard(projection(['unknown']), 'es-ES', links)).toContain(
      'estado desconocido',
    );
    expect(renderBugbotStatusCard(projection(['reopened']), 'es-ES', links)).toContain(
      'requiere atención',
    );
  });

  it('renders partial synchronization in both locales with sanitized details', () => {
    const partial = buildBugbotReviewProjection({
      pullRequestNumber: 358,
      analyzedHeadSha: head,
      coverage: completeCoverage,
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

  it('never presents an empty partial-context review as globally clean', () => {
    const partialCoverage = {
      status: 'partial' as const,
      sources: [{
        source: 'issue-comments' as const,
        status: 'partial' as const,
        pagesFetched: 2,
        itemsFetched: 200,
        itemsRetained: 200,
        omittedItems: 1,
        truncatedItems: 2,
        limitReached: true,
        providerLimitReached: true,
      }],
    };
    const body = renderBugbotStatusCard(buildBugbotReviewProjection({
      pullRequestNumber: 358,
      analyzedHeadSha: head,
      coverage: partialCoverage,
      findings: [],
    }), 'en-US', links);

    expect(body).toContain('cannot declare the whole pull request clean');
    expect(body).toContain('issue-comments: partial; retained=200, omitted=1');
    expect(body).toContain('truncated=2');
    expect(body).toContain('provider page limit reached');
    expect(body).toContain('Inspect the omitted items or reduce the pull request scope');
    expect(body).toContain('Rerun the review only after changing');
    expect(body).not.toContain('Run `/copilot recheck`');
    expect(body).not.toContain('No active findings');
    expect(body).not.toContain('No action required');
    const spanish = renderBugbotStatusCard(buildBugbotReviewProjection({
      pullRequestNumber: 358,
      analyzedHeadSha: head,
      coverage: partialCoverage,
      findings: [],
    }), 'es-ES', links);
    expect(spanish).toContain('## Bugbot: revisión incompleta');
    expect(spanish).toContain('Repite la revisión solo después de cambiar');
    expect(spanish).toContain('<summary>Cobertura incompleta</summary>');
  });

  it('renders empty and long finding lists without requiring a workflow-run link', () => {
    const noRunLinks = { pullRequestUrl: links.pullRequestUrl, commitUrl: links.commitUrl };
    expect(renderBugbotStatusCard(projection(), 'es-ES', noRunLinks)).toContain('revisión completada');
    const long = buildBugbotReviewProjection({
      pullRequestNumber: 358,
      analyzedHeadSha: head,
      coverage: completeCoverage,
      findings: Array.from({ length: 22 }, (_, index) => ({
        id: `finding-${index}`,
        state: index % 2 === 0 ? 'obsolete' as const : 'dismissed' as const,
      })),
    });
    const body = renderBugbotStatusCard(long, 'en-US', noRunLinks);
    expect(body).not.toContain('Workflow run');
    expect(body).not.toContain('### Findings');

    const actionable = buildBugbotReviewProjection({
      pullRequestNumber: 358,
      analyzedHeadSha: head,
      coverage: completeCoverage,
      findings: Array.from({ length: 22 }, (_, index) => ({ id: `open-${index}`, state: 'open' as const })),
    });
    expect(renderBugbotStatusCard(actionable, 'en-US', noRunLinks)).toContain('…and 2 more.');
    expect(renderBugbotStatusCard(actionable, 'es-ES', noRunLinks)).toContain('…y 2 más.');
  });

  it('rejects malformed and outdated status markers', () => {
    expect(isBugbotStatusComment('<!-- copilot-bugbot-status -->')).toBe(false);
    expect(isBugbotStatusComment(null)).toBe(false);
    expect(isBugbotStatusComment(buildBugbotStatusMarker(projection()))).toBe(true);
  });

  it('preserves the single current snapshot schema while refreshing its state block', () => {
    const body = renderBugbotReviewSnapshot(
      '## 🤖 Bugbot review snapshot\n\nBugbot reported **1** potential problem when this commit was analyzed.',
      {
        reviewIdentity: '77',
        analyzedHeadSha: head,
        currentHeadSha: 'b'.repeat(40),
        projectionDigest: '12345678',
        coverageStatus: 'complete',
        findings: projection(['fixed']).findings,
        locale: 'en-US',
        statusUrl: links.pullRequestUrl,
      },
    );
    expect(body).toContain('All findings originating in this review are resolved');
    expect(body).toContain('Bugbot reported **1** potential problem when this commit was analyzed.');
    expect(body).toContain('Bugbot review snapshot');
    expect(body.match(/Bugbot review snapshot/gu)).toHaveLength(1);
  });

  it('replaces an existing status block idempotently', () => {
    const first = renderBugbotReviewSnapshot('## 🤖 Bugbot review snapshot\n\nHistory.', {
      reviewIdentity: '77',
      analyzedHeadSha: head,
      currentHeadSha: head,
      projectionDigest: '12345678',
      coverageStatus: 'complete',
      findings: projection(['open']).findings,
      locale: 'en-US',
      statusUrl: links.pullRequestUrl,
    });
    const second = renderBugbotReviewSnapshot(first, {
      reviewIdentity: '77',
      analyzedHeadSha: head,
      currentHeadSha: head,
      projectionDigest: '12345678',
      coverageStatus: 'complete',
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
        coverageStatus: 'complete',
        findings: projection(states).findings,
        locale,
        statusUrl: links.pullRequestUrl,
      });
    expect(render(['open'], 'en-US')).toContain('requires attention');
    expect(render(['open'], 'es-ES')).toContain('requiere atención');
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
      coverageStatus: 'complete',
      findings: projection(['fixed']).findings,
      locale: 'en-US',
      statusUrl: links.pullRequestUrl,
    });
    const active = renderBugbotReviewSnapshot(original, {
      reviewIdentity: '77',
      analyzedHeadSha: head,
      currentHeadSha: head,
      projectionDigest: '12345678',
      coverageStatus: 'complete',
      findings: projection(['open']).findings,
      locale: 'es-ES',
      statusUrl: links.pullRequestUrl,
    });
    expect(clean).toContain('No individually tracked finding');
    expect(clean).toContain('historical overflow without individual threads');
    expect(clean).not.toContain('All findings originating');
    expect(active).toContain('con seguimiento individual');
    expect(active).toContain('hallazgos históricos sin hilo individual');
    expect(renderBugbotReviewSnapshot(original, {
      reviewIdentity: '77', analyzedHeadSha: head, currentHeadSha: head,
      projectionDigest: '12345678', coverageStatus: 'complete', findings: projection(['fixed']).findings,
      locale: 'es-ES', statusUrl: links.pullRequestUrl,
    })).toContain('Ningún hallazgo con seguimiento individual');
  });

  it('renders Spanish partial-coverage historical status', () => {
    const body = renderBugbotReviewSnapshot(null, {
      reviewIdentity: '77', analyzedHeadSha: head, currentHeadSha: head,
      projectionDigest: '12345678', coverageStatus: 'partial', findings: [],
      locale: 'es-ES', statusUrl: links.pullRequestUrl,
    });
    expect(body).toContain('La cobertura global es parcial');
    expect(body).toContain('Última reconciliación en');
  });

  it('sanitizes titles before publishing them in the status card', () => {
    const unsafe = buildBugbotReviewProjection({
      pullRequestNumber: 358,
      analyzedHeadSha: head,
      coverage: completeCoverage,
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
