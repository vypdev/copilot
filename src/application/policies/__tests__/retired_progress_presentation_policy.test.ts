import { buildRetiredProgressComment } from '../retired_progress_presentation_policy';
import { buildPublicationMarker, parsePublicationMarker } from '../publication_identity_policy';
const marker = buildPublicationMarker({ identity: { topic: 'progress', target: { kind: 'issue', number: 42 }, key: 'work' }, sourceVersion: `head:${'a'.repeat(40)}`, digest: 'abcdef1234567890' });
const active = marker + '\n\n## Progress: 96% — in progress\n\nLast estimate.';

describe('historical progress presentation', () => {
  it.each(['completed', 'not_planned', 'duplicate', 'unknown'] as const)('distinguishes native %s closure from the last estimate', reason => {
    const body = buildRetiredProgressComment(active, 'en-US', reason)!;
    expect(body).toContain('96%'); expect(body).not.toContain('100%');
    expect(body).toContain('historical'); expect(body).toContain('reopen the issue');
    expect(parsePublicationMarker(body)?.sourceVersion).toBe(`closed:${reason}:head:${'a'.repeat(40)}`);
    expect(body).toContain(reason === 'not_planned' ? 'not planned' : reason === 'unknown' ? 'reason unavailable' : reason);
    expect(buildRetiredProgressComment(body, 'en-US', reason)).toBe(body);
  });
  it.each(['es-ES', 'es-MX', 'ES'] )('uses Spanish static copy for %s', locale => {
    const body = buildRetiredProgressComment(active, locale, 'duplicate')!;
    expect(body).toContain('progreso histórico'); expect(body).toContain('duplicada'); expect(body).toContain('ninguna');
  });
  it.each(['en-US', 'fr-FR', ''])('uses complete English fallback for %s', locale => {
    expect(buildRetiredProgressComment(active, locale, 'unknown')).toContain('Issue closed');
  });
  it('retains the archive when a verified closure reason changes', () => {
    const initial = buildRetiredProgressComment(active, 'en-US', 'completed')!;
    const changed = buildRetiredProgressComment(initial, 'es-ES', 'not_planned')!;
    expect(changed).toContain('no planificada'); expect(changed).toContain('96%');
    expect(changed.match(/96%/gu)).toHaveLength(1);
  });
  it('supports an exact SHA-256 Git object ID', () => {
    expect(buildRetiredProgressComment(active.replace('a'.repeat(40), 'b'.repeat(64)), 'en-US', 'completed')).toContain(`head:${'b'.repeat(64)}`);
  });
  it('neutralizes mentions, commands, controls and HTML in historical content', () => {
    const body = buildRetiredProgressComment(marker + '\n\n@someone\n/copilot fix\n::error::bad\n<details><script>bad</script></details>', 'en-US', 'completed')!;
    expect(body).not.toContain('@someone'); expect(body).not.toContain('\n/copilot');
    expect(body).not.toContain('<script>'); expect(body).toContain('&lt;script&gt;');
  });
  it.each(['missing', 'unknown-schema', 'other-topic', 'other-target', 'other-key', 'unknown-source', 'short-sha', 'multiple-markers', 'prefixed', 'empty', 'oversized', 'archive-in-active'])('rejects %s rather than inventing an assessment', kind => {
    let body = active;
    if (kind === 'missing') body = '96%';
    if (kind === 'unknown-schema') body = body.replace('schema="1"', 'schema="2"');
    if (kind === 'other-topic') body = body.replace('topic="progress"', 'topic="plan"');
    if (kind === 'other-target') body = body.replace('target="issue:42"', 'target="pr:42"');
    if (kind === 'other-key') body = body.replace('key="work"', 'key="other"');
    if (kind === 'unknown-source') body = body.replace('head:', 'future:');
    if (kind === 'short-sha') body = body.replace('a'.repeat(40), 'abc1234');
    if (kind === 'multiple-markers') body += marker;
    if (kind === 'prefixed') body = 'human content' + body;
    if (kind === 'empty') body = marker;
    if (kind === 'oversized') body += 'x'.repeat(12_001);
    if (kind === 'archive-in-active') body += '<!-- copilot:progress-archive schema="1" -->';
    expect(buildRetiredProgressComment(body, 'en-US', 'completed')).toBeUndefined();
  });
  it.each(['missing-start', 'missing-end', 'double-start', 'double-end', 'trailing', 'nonquoted', 'empty', 'oversized'])('rejects a malformed retired archive: %s', kind => {
    let body = buildRetiredProgressComment(active, 'en-US', 'completed')!;
    const start = '<!-- copilot:progress-archive schema="1" -->', end = '<!-- /copilot:progress-archive -->';
    if (kind === 'missing-start') body = body.replace(start, '');
    if (kind === 'missing-end') body = body.replace(end, '');
    if (kind === 'double-start') body = body.replace(start, start + start);
    if (kind === 'double-end') body += end;
    if (kind === 'trailing') body += ' trailing';
    if (kind === 'nonquoted') body = body.replace('> Last estimate.', 'unquoted');
    if (kind === 'empty') body = body.slice(0, body.indexOf(start) + start.length) + '\n' + end;
    if (kind === 'oversized') body += 'x'.repeat(28_001);
    expect(buildRetiredProgressComment(body, 'en-US', 'completed')).toBeUndefined();
  });
  it('rejects an open-only reason', () => expect(buildRetiredProgressComment(active, 'en-US', 'reopened')).toBeUndefined());
});

describe('retired output remains within its replay envelope', () => {
  it.each(['escaped-html', 'line-prefixes'])('withholds an archive whose %s expansion exceeds 28000 units', kind => {
    const assessment = kind === 'escaped-html' ? '&'.repeat(8_000) : 'First\n' + '\n'.repeat(10_000) + 'Last';
    const body = marker + '\n\n## Progress: 96% — in progress\n\n' + assessment;
    expect(body.length).toBeLessThanOrEqual(12_000);
    expect(buildRetiredProgressComment(body, 'en-US', 'completed')).toBeUndefined();
  });
  it('retains a large safe archive and allows a verified reason change on replay', () => {
    const body = marker + '\n\n## Progress: 96% — in progress\n\n' + '&'.repeat(5_000);
    const retired = buildRetiredProgressComment(body, 'en-US', 'completed')!;
    expect(retired.length).toBeLessThanOrEqual(28_000); expect(retired).toContain('96%');
    expect(buildRetiredProgressComment(retired, 'es-ES', 'not_planned')).toContain('no planificada');
  });
});


describe('archive capacity across native reason and locale changes', () => {
  it('withholds an English archive that cannot fit a later Spanish native reason', () => {
    const overhead = buildRetiredProgressComment(marker + '\n\nA', 'en-US', 'completed')!.length - 1;
    const body = marker + '\n\n' + '&'.repeat(5_400) + 'x'.repeat(28_000 - overhead - 27_000);
    expect(body.length).toBeLessThan(12_000);
    expect(buildRetiredProgressComment(body, 'en-US', 'completed')).toBeUndefined();
  });
  it('keeps every accepted near-limit archive renderable in both locales and every closed reason', () => {
    const body = marker + '\n\n' + '&'.repeat(5_390);
    const archive = buildRetiredProgressComment(body, 'en-US', 'completed')!;
    for (const locale of ['en-US', 'es-ES']) {
      for (const reason of ['completed', 'not_planned', 'duplicate', 'unknown'] as const) {
        const replay = buildRetiredProgressComment(archive, locale, reason)!;
        expect(replay).toBeDefined(); expect(replay.length).toBeLessThanOrEqual(28_000);
        expect(buildRetiredProgressComment(replay, locale, reason)).toBe(replay);
      }
    }
  });
});
