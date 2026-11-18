'use strict';

// The harness models a single admitted writer. The deployment must supply the
// cross-run serialization and authoritative reads at this same boundary.
const { createHash } = require('node:crypto');
const { renderBugbotLiveProgress } = require('../../../../../src/application/policies/bugbot_live_progress_presentation_policy');
const { readBugbotProgressCheckObservation } = require('../../../../../src/application/policies/bugbot_progress_check_observation_policy');
const { parsePublicationMarker } = require('../../../../../src/application/policies/publication_identity_policy');
const { readBugbotStatusCounts } = require('../../../../../src/application/policies/bugbot_status_count_marker_policy');
const { canonicalGitObjectId } = require('../../../../../src/domain/git_object_id');

const active = '<!-- copilot-bugbot-active schema="1" ';
const activeMarker = /^<!-- copilot-bugbot-active schema="1" source="([a-z0-9:]{1,256})" sequence="([1-9]\d{0,15})" -->$/u;
const end = '<!-- /copilot-bugbot-active -->';
const cardLimit = 60_000;
const id = value => Number.isSafeInteger(value) && value > 0;

function sameSource(left, right) {
    return Boolean(left && right && id(left.repositoryId) && id(left.pullNumber)
        && typeof left.base === 'string' && canonicalGitObjectId(left.base) === left.base
        && typeof left.baseRef === 'string' && canonicalGitObjectId(left.baseRef) === left.baseRef
        && typeof left.head === 'string' && canonicalGitObjectId(left.head) === left.head
        && /^(?:default|[0-9a-f]{64})$/u.test(left.policy)
        && left.repositoryId === right.repositoryId && left.pullNumber === right.pullNumber
        && left.base === right.base && left.baseRef === right.baseRef && left.head === right.head && left.policy === right.policy);
}

function sameAttempt(left, right) {
    return Boolean(left && right && id(left.runId) && id(left.attempt)
        && left.runId === right.runId && left.attempt === right.attempt);
}

function verifiedHead(body, pullNumber) {
    const marker = parsePublicationMarker(body.split('\n', 1)[0]);
    if (marker?.identity.topic !== 'bugbot' || marker.identity.target.kind !== 'pull-request'
        || marker.identity.target.number !== pullNumber || marker.identity.key !== 'aggregate') return undefined;
    const head = marker.sourceVersion.startsWith('head:') && canonicalGitObjectId(marker.sourceVersion.slice(5));
    // The effect belongs to an already validated terminal projection.
    return head && /^[a-f0-9]{8}$/u.test(marker.digest)
        && body.includes(`<!-- copilot-bugbot-status schema="1" pr="${pullNumber}" verified_head="${head}" digest="${marker.digest}" -->`)
        && readBugbotStatusCounts(body, pullNumber, head) ? head : undefined;
}

function readCard(body, pullNumber) {
    if (!body) return { verified: '' };
    if (!body.startsWith(active)) return verifiedHead(body, pullNumber) ? { verified: body } : undefined;
    const match = activeMarker.exec(body.split('\n', 1)[0]);
    if (!match || !id(Number(match[2]))) return undefined;
    const split = body.indexOf('\n' + end + '\n\n');
    if (split < 0 || body.indexOf(active, active.length) >= 0 || body.indexOf(end, split + end.length + 1) >= 0) return undefined;
    const verified = body.slice(split + end.length + 3);
    if (verified && !verifiedHead(verified, pullNumber)) return undefined;
    return { verified, source: match[1], sequence: Number(match[2]) };
}

function renderCard(previous, snapshot) {
    const { source, review, verifiedBody, locale } = snapshot;
    const stored = readCard(previous, source.pullNumber);
    if (!stored || (verifiedBody !== undefined && verifiedHead(verifiedBody, source.pullNumber) !== source.head)) return undefined;
    const verified = verifiedBody ?? stored.verified;
    if (review.state === 'complete') return verifiedHead(verified, source.pullNumber) === source.head ? verified : undefined;
    if (review.state !== 'active' && review.state !== 'interrupted') return undefined;
    const { checkDetails, runUrl } = review;
    const externalId = ['bugbot', source.pullNumber, source.base, source.head, source.policy, review.runId, review.attempt].join(':');
    const observation = typeof checkDetails === 'string' && readBugbotProgressCheckObservation(checkDetails, externalId);
    if (!observation || (observation.baseRefSha ?? observation.baseSha) !== source.baseRef || !/^https:\/\/[a-z0-9.-]+(?::\d+)?\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+\/attempts\/\d+$/iu.test(runUrl)
        || runUrl !== `${snapshot.repositoryUrl}/actions/runs/${review.runId}/attempts/${review.attempt}`) return undefined;
    if (observation.stage === 'finished' && !(review.state === 'interrupted' && observation.outcome === 'failed')) return undefined;
    const identity = [source.repositoryId, source.pullNumber, source.base, source.baseRef, source.head, source.policy, review.runId, review.attempt];
    const key = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
    if (stored.source === key && stored.sequence > observation.sequence) return undefined;
    const spanish = /^es(?:-|$)/iu.test(locale);
    const label = spanish ? 'Última revisión verificada' : 'Last verified review';
    const previousTitle = verified ? `${label} · \`${verifiedHead(verified, source.pullNumber).slice(0, 8)}\``
        : spanish ? 'Aún no hay una revisión verificada' : 'No verified review yet';
    const view = renderBugbotLiveProgress(review.state === 'interrupted'
        ? { ...observation, stage: 'finished', outcome: 'failed' } : observation, locale, runUrl);
    const action = review.state === 'active' ? (spanish ? 'No hace falta intervenir.' : 'No action required.')
        : (spanish ? 'Consulta la ejecución antes de reintentar.' : 'Inspect the run before retrying.');
    return [`${active}source="${key}" sequence="${observation.sequence}" -->`, view.summary, '', action, '', `### ${previousTitle}`, end, '', verified].join('\n');
}

async function publishCard(wakeup, lane) {
    if (wakeup.dryRun) return 'dry-run';
    const { source } = wakeup;
    if (!sameSource(source, source)) return 'skipped';
    return lane.exclusive(source.repositoryId, source.pullNumber, async writer => {
        const snapshot = await writer.read();
        if (!sameSource(source, snapshot?.source) || !sameAttempt(wakeup, snapshot.review)) return 'skipped';
        const { canonical } = snapshot;
        if (canonical && (!id(canonical.id) || !canonical.trusted || typeof canonical.body !== 'string')) return 'skipped';
        const body = renderCard(canonical?.body, snapshot);
        if (body === undefined || Buffer.byteLength(body) > cardLimit) return 'skipped';
        if (canonical?.body === body) return 'unchanged';
        if (!await writer.isCurrent(snapshot)) return 'skipped';
        await writer.publish({ id: canonical?.id, body });
        return canonical ? 'updated' : 'created';
    });
}

module.exports = { publishCard, renderCard };
