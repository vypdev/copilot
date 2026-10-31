import { ImmutableProgressContentRepository } from '../../../data/repository/immutable_progress_content_repository';
import { objectFixture, BASE, HEAD } from '../../../data/repository/__tests__/fixtures/progress_object_fixture';
import { progressRecoveryError } from '../progress_content_evidence_policy';
import { progressEvidenceTooLarge } from '../progress_diff_partition_policy';
import { progressProtocolRejected } from '../progress_evidence_protocol_policy';
import { buildApplicationErrorPresentation, renderApplicationErrorMarkdown, renderApplicationErrorText } from '../application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../application_error_message_catalog';

it.each(['en-US', 'es-ES'])('presents supported automatic continuation and retained state in %s', locale => {
    const catalog = resolveStaticApplicationErrorCatalog(locale), view = buildApplicationErrorPresentation(progressEvidenceTooLarge(), catalog.message);
    expect(view.action).toMatch(locale === 'en-US' ? /continues automatically/ : /continúa automáticamente/);
    expect(view.action).toMatch(locale === 'en-US' ? /current managed source/ : /fuente gestionada actual/);
    expect(view.retainedState).toMatch(locale === 'en-US' ? /progress labels/ : /etiquetas de progreso/);
});
it('keeps identical over-capacity comparisons terminal', () => {
    const error = progressEvidenceTooLarge(); expect(error.retryable).toBe(false);
    expect(buildApplicationErrorPresentation(error).action).toContain('identical over-limit comparison cannot gain capacity');
});
it('does not recommend splitting a coherent package or changing the base', () => {
    const view = buildApplicationErrorPresentation(progressEvidenceTooLarge()); expect(view.action).not.toMatch(/split|retarget|smaller changes/iu);
});
it('uses the same continuation contract in terminal and GitHub Markdown', () => {
    const error = progressEvidenceTooLarge();
    for (const view of [renderApplicationErrorText(error), renderApplicationErrorMarkdown(error)]) {
        expect(view).toContain('continues automatically'); expect(view).toContain('Existing progress labels');
    }
});
it('exposes only closed source-protocol reasons while preserving progress', () => {
    const error = progressProtocolRejected('source-coverage'); expect(error.toJSON()).toMatchObject({ code: 'validation.evidence-unavailable', retryable: false });
    expect(error.message).toContain('(source-coverage)'); expect(error.message).toContain('Existing progress was retained');
});
it('distinguishes an unusable completed response from unavailable source objects', () => {
    const error = progressProtocolRejected('response-identity'); expect(error).toMatchObject({ code: 'agent.failed', retryable: true });
    expect(error.message).toContain('fresh complete attempt');
});
it('bounds unreviewed path excerpts while preserving their exact total', () => {
    const paths = Array.from({ length: 20 }, (_, index) => `specs/${index}.md`), error = progressRecoveryError('owned capacity limit', paths, true);
    expect(error.message).toContain('Unreviewed paths (20)'); expect(error.message).toContain('specs/7.md');
    expect(error.message).not.toContain('specs/8.md'); expect(error.message).toContain('…');
});
it('renders mention and Markdown control characters as inert path data', () => {
    const error = progressRecoveryError('owned capacity limit', ['specs/@all`<x>|.md'], true);
    expect(error.message).not.toContain('@all'); expect(error.message).not.toContain('<x>'); expect(error.message).toContain('\\u0040all');
});
it('renders terminal control characters without emitting an active control sequence', () => {
    const error = progressRecoveryError('owned capacity limit', ['specs/\u0085hidden.md'], true);
    expect(error.message).not.toContain('\u0085'); expect(error.message).toContain('\\u0085');
});
it('reports the actual exhausted counters and path excerpt without a partial outcome', async () => {
    const objects = objectFixture({}, Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`specs/${i}.md`, ''])));
    const repository = new ImmutableProgressContentRepository(objects.client, 'o', 'r', 'framed-v1');
    for (let i = 0; i < 256; i++) await repository.recover(BASE, HEAD, `specs/${i}.md`, 'added', undefined, [`specs/${i}.md`]);
    await expect(repository.recover(BASE, HEAD, 'specs/256.md', 'added', undefined, ['specs/256.md'])).rejects.toMatchObject({
        code: 'validation.evidence-too-large', retryable: false,
        message: expect.stringMatching(/frames 4\/4, files 256\/256.*Unreviewed paths \(1\)/u),
    });
});
it('keeps the correlation reference stable across public serialization and presentation', () => {
    const error = progressEvidenceTooLarge(), view = buildApplicationErrorPresentation(error);
    expect(view.reference).toBe(error.toJSON().correlationId); expect(view.reference).toMatch(/^[a-f0-9-]{36}$/u);
});
