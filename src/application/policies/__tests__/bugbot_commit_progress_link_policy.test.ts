import { selectBugbotCommitProgressLink } from '../bugbot_commit_progress_link_policy';
import { buildPublicationMarker } from '../publication_identity_policy';
import { renderBugbotStatusCard } from '../bugbot_review_presentation_policy';
import { buildBugbotReviewProjection } from '../../../domain/bugbot/review_projection';

const repository = 'https://git.example.com/org/repo';
const pullUrl = `${repository}/pull/951`;
const head = 'a'.repeat(40);
const previous = 'b'.repeat(40);
const token = buildPublicationMarker({ identity: { topic: 'progress', key: 'work', target: { kind: 'issue', number: 950 } },
    sourceVersion: `head:${previous}:scope:${'a'.repeat(64)}`, digest: 'a'.repeat(16) });
const card = { id: 14, user: { login: 'bugbot' }, body: `${token}\n\n## Progress · 45% estimated\n\n[Pull request](${pullUrl})\n` };
const read = (cards = [card], url = pullUrl) => selectBugbotCommitProgressLink(cards, 950, 951, url, 'Bugbot');

it('links the owned, scoped assessment to its actual comment, including on an enterprise host', () => {
    const link = read();
    expect(link).toEqual({ assessedHeadSha: previous, url: `${repository}/issues/950#issuecomment-14` });
    const projection = buildBugbotReviewProjection({
        pullRequestNumber: 951, analyzedHeadSha: head, verifiedHeadSha: head, findings: [],
        coverage: { status: 'complete', sources: [] },
    });
    const navigation = { pullRequestUrl: pullUrl, commitUrl: `${repository}/commit/${head}` };
    const baseline = renderBugbotStatusCard(projection, 'en', navigation);
    expect(renderBugbotStatusCard(projection, 'en', { ...navigation, commitProgress: link })).toBe(
        baseline + `\n\n[Previous implementation assessment](${link!.url}) · \`bbbbbbbb\``);
    expect(renderBugbotStatusCard(projection, 'es', { ...navigation, commitProgress: { ...link!, assessedHeadSha: head } }))
        .toContain(`[Avance de implementación y trabajo pendiente](${link!.url}) · \`aaaaaaaa\``);
});

it.each([
    { ...card, id: 0 },
    { ...card, user: { login: 'another-author' } },
    { ...card, body: null },
    { ...card, body: card.body.replace('issue:950', 'issue:951') },
    { ...card, body: card.body.replace('key="work"', 'key="another"') },
    { ...card, body: card.body.replace('topic="progress"', 'topic="plan"') },
    { ...card, body: card.body.replace('target="issue:', 'target="pr:') },
    { ...card, body: card.body.replace(/:scope:[a-z0-9]+/u, '') },
    { ...card, body: card.body.replace('/pull/951', '/pull/952') },
    { ...card, body: card.body.replace('[Pull request]', 'Text looking like a link') },
    { ...card, body: 'Follow-up\n' + card.body },
])('omits cards with an unverified identity or missing PR binding (%#)', candidate => {
    expect(selectBugbotCommitProgressLink([candidate], 950, 951, pullUrl, 'bugbot')).toBeUndefined();
});

it('omits the link when duplicate cards disagree or navigation is unrelated', () => {
    expect(read([card, { ...card, id: 15 }])).toBeUndefined();
    expect(read([card], pullUrl.replace('https:', 'http:'))).toBeUndefined();
    expect(read([card], pullUrl.replace('/951', '/952'))).toBeUndefined();
});
