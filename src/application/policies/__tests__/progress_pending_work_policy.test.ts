import { readProgressWorkAssessment, renderProgressWorkAssessment, type ProgressWorkAssessment } from '../progress_pending_work_policy';

const head = 'a'.repeat(40);
const scope = 'b'.repeat(64);
const repo = 'https://github.com/vypdev/copilot';
const links = { repositoryUrl: repo, issueNumber: 950, runUrl: `${repo}/actions/runs/123/attempts/2` };
const fixture: ProgressWorkAssessment = {
    headSha: head, scopeDigest: scope, pullNumber: 951, sdd: { commitSha: 'c'.repeat(40), path: 'specs/example.md' },
    outcomes: [
        { id: 'R1', status: 'supported', remaining: null, origin: 'issue' },
        { id: 'R2', status: 'verification-unknown', remaining: 'Check the current CI result.', origin: 'draft', evidencePath: 'src/a.ts' },
        ...Array.from({ length: 8 }, (_, index) => ({ id: `R${index + 3}`, status: 'missing' as const,
            remaining: 'Implement remaining work.', origin: 'issue' as const, evidencePath: 'src/b.ts' })),
    ],
};

it('keeps the estimate separate from outcome counts and reserves a visible verification item', () => {
    expect(readProgressWorkAssessment(fixture, head, scope, 45)).toEqual(fixture);
    const card = renderProgressWorkAssessment(45, fixture, 'en-US', links);
    expect(card).toContain('45% estimated');
    expect(card).toContain('1/10 supported');
    expect(card).toContain('8 need implementation · 1 need verification or clarification');
    expect(card.match(/^- R\d+/gmu)).toHaveLength(6);
    expect(card.indexOf('Implementation still needed')).toBeLessThan(card.indexOf('Verification or clarification needed'));
    expect(card).toContain('3 more pending requirements');
    expect(card).toContain(`[Full assessment](${links.runUrl}#summary)`);
});

it('renders every pending ID once in the full assessment and uses pinned source links', () => {
    const full = renderProgressWorkAssessment(45, fixture, 'en-US', links, true);
    expect(full.match(/^- R\d+/gmu)).toEqual(['- R3', '- R4', '- R5', '- R6', '- R7', '- R8', '- R9', '- R10', '- R2']);
    expect(full).toContain(`/blob/${'c'.repeat(40)}/specs/example.md`);
    expect(full).toContain(`/blob/${head}/src/a.ts`);
    expect(full).toContain('/pull/951');
    expect(full).not.toContain('more pending requirements');
});

it('keeps the full list where no native run link is available', () => {
    const card = renderProgressWorkAssessment(45, fixture, 'es-MX', { repositoryUrl: repo, issueNumber: 950 });
    expect(card).toContain('45% estimado');
    expect(card).toContain('Implementación pendiente');
    expect(card.match(/^- R\d+/gmu)).toHaveLength(9);
    expect(card).not.toContain('Evaluación completa');
});

it.each([
    { headSha: 'c'.repeat(40) },
    { scopeDigest: 'c'.repeat(64) },
    { pullNumber: 0 },
    { sdd: { commitSha: 'c'.repeat(40), path: '../../owner.md' } },
    { outcomes: [fixture.outcomes[1], fixture.outcomes[1]] },
    { outcomes: [{ ...fixture.outcomes[1], evidencePath: '../secret' }] },
    { outcomes: [{ ...fixture.outcomes[1], remaining: '' }] },
    { outcomes: [{ ...fixture.outcomes[1], status: 'unknown' }] },
    { outcomes: [{ ...fixture.outcomes[0], remaining: 'Unexpected' }] },
])('rejects invalid structured work without inventing outcomes (%j)', replacement => {
    expect(readProgressWorkAssessment({ ...fixture, ...replacement }, head, scope, 45)).toBeUndefined();
});

it('renders complete without open items and rejects a false completion', () => {
    expect(readProgressWorkAssessment(fixture, head, scope, 100)).toBeUndefined();
    const complete = { ...fixture, outcomes: fixture.outcomes.slice(0, 1) };
    expect(readProgressWorkAssessment(complete, head, scope, 100)).toEqual(complete);
    const card = renderProgressWorkAssessment(100, complete, 'es-ES', links);
    expect(card).toContain('Todos los requisitos evaluados están respaldados.');
    expect(card).not.toContain('Implementación pendiente');
});

it('keeps raw URLs, commands, mentions, HTML and model Markdown inert', () => {
    const work = { ...fixture, outcomes: [{ ...fixture.outcomes[1], remaining: '[External](https://example.org)\n/copilot fix all @team <script>' }] };
    const card = renderProgressWorkAssessment(45, work, 'en-US', links);
    expect(card).not.toContain('](https://example.org)');
    expect(card).not.toContain('@team');
    expect(card).not.toContain('<script>');
    expect(card).not.toContain('\n/copilot');
});
