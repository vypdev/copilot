import { createHash } from 'node:crypto';
import { canonicalGitObjectId } from '../../domain/git_object_id';
import type { BugbotReviewProgressObservation } from '../ports/bugbot_review_progress_ports';
import { renderBugbotLiveProgress } from './bugbot_live_progress_presentation_policy';
import { readBugbotProgressCheckObservation } from './bugbot_progress_check_observation_policy';
import { parsePublicationMarker } from './publication_identity_policy';

const progressStart = '<!-- copilot-bugbot-active schema="1" ';
const progressEnd = '\n<!-- /copilot-bugbot-active -->\n\n';
const progressMarker = /^<!-- copilot-bugbot-active schema="1" pr="([1-9]\d{0,15})" source="([a-f0-9]{64})" sequence="([1-9]\d{0,15})" digest="([a-f0-9]{64})" -->$/u;
const terminalMarker = /\n\n<!-- copilot-bugbot-card-terminal schema="1" source="([a-f0-9]{64})" -->$/u;
const maxCommentBytes = 60_000;

export interface BugbotStatusCardSource {
    readonly repositoryId: number;
    readonly pullNumber: number;
    readonly base: string;
    readonly baseRef: string;
    readonly head: string;
    readonly policy: string;
}

interface NativeAttempt {
    readonly runId: number;
    readonly attempt: number;
}

export interface BugbotStatusCardWakeup extends NativeAttempt {
    readonly source: BugbotStatusCardSource;
    readonly dryRun: boolean;
}

export interface BugbotStatusCardSnapshot {
    readonly source: BugbotStatusCardSource;
    /** Only the authenticated native check for this comparison and attempt. */
    readonly review: NativeAttempt & ({
        readonly state: 'active' | 'interrupted';
        readonly checkDetails: string;
        readonly runUrl: string;
    } | { readonly state: 'complete'; readonly closeAttempt?: true });
    /** The repository adapter attests ownership and pagination completeness. */
    readonly canonical?: { readonly id: number; readonly body: string };
    /** When present, a terminal or recheck projection validated before handoff. */
    readonly verifiedBody?: string;
    readonly repositoryUrl: string;
    readonly locale: string;
}

export type BugbotStatusCardEffect = 'created' | 'updated' | 'unchanged' | 'skipped' | 'dry-run';

interface AdmittedStatusCardWriter {
    read(): Promise<BugbotStatusCardSnapshot | undefined>;
    isCurrent(snapshot: BugbotStatusCardSnapshot): Promise<boolean>;
    publish(effect: { readonly id?: number; readonly body: string }): Promise<void>;
}

export interface BugbotStatusCardPublicationLane {
    /** Native job concurrency must admit this writer before it can read or mutate. */
    exclusive(repositoryId: number, pullNumber: number,
        operation: (writer: AdmittedStatusCardWriter) => Promise<BugbotStatusCardEffect>): Promise<BugbotStatusCardEffect>;
}

const positive = (id: number) => Number.isSafeInteger(id) && id > 0;

export function isBugbotStatusCardSource(source: BugbotStatusCardSource): boolean {
    return positive(source.repositoryId) && positive(source.pullNumber) && canonicalGitObjectId(source.base) === source.base
        && canonicalGitObjectId(source.baseRef) === source.baseRef && canonicalGitObjectId(source.head) === source.head
        && /^(?:default|[0-9a-f]{64})$/u.test(source.policy);
}

function sameSource(left: BugbotStatusCardSource, right: BugbotStatusCardSource): boolean {
    return left.repositoryId === right.repositoryId && left.pullNumber === right.pullNumber && left.base === right.base
        && left.baseRef === right.baseRef && left.head === right.head && left.policy === right.policy;
}

export function readBugbotStatusCardHead(body: string, pullNumber: number): string | undefined {
    const [first, second] = body.split('\n', 2);
    const marker = parsePublicationMarker(first);
    if (marker?.identity.topic !== 'bugbot' || marker.identity.target.kind !== 'pull-request'
        || marker.identity.target.number !== pullNumber || marker.identity.key !== 'aggregate'
        || !marker.sourceVersion.startsWith('head:') || !/^[a-f0-9]{8}$/u.test(marker.digest)) return undefined;
    const head = canonicalGitObjectId(marker.sourceVersion.slice(5));
    if (head !== marker.sourceVersion.slice(5)) return undefined;
    return second === `<!-- copilot-bugbot-status schema="1" pr="${pullNumber}" verified_head="${head}" digest="${marker.digest}" -->`
        ? head : undefined;
}

function readCard(body: string | undefined, pullNumber: number):
    { readonly previous: string; readonly progress?: { readonly source: string; readonly sequence: number; readonly digest: string } } | undefined {
    if (body === undefined) return { previous: '' };
    if (!body.startsWith(progressStart)) return readBugbotStatusCardHead(body, pullNumber) ? { previous: body } : undefined;
    const match = progressMarker.exec(body.split('\n', 1)[0]);
    const split = body.indexOf(progressEnd);
    if (!match || Number(match[1]) !== pullNumber || !positive(Number(match[3])) || split < 0
        || body.indexOf(progressStart, progressStart.length) >= 0
        || body.indexOf(progressEnd, split + progressEnd.length) >= 0) return undefined;
    const previous = body.slice(split + progressEnd.length);
    if (previous && !readBugbotStatusCardHead(previous, pullNumber)) return undefined;
    return { previous, progress: { source: match[2], sequence: Number(match[3]), digest: match[4] } };
}

/** A candidate comment still requires repository, conversation and author authentication. */
export function isBugbotCanonicalStatusCard(body: string, pullNumber: number): boolean {
    return readCard(body, pullNumber) !== undefined;
}

const nextStep = {
    en: {
        preparing: 'Finish preparing the pinned comparison.',
        analyzing: 'Validate the remaining diff analysis.',
        verifying: 'Finish validating the remaining verdicts.',
        publishing: 'Reconcile the validated review and publish the result.',
        partitions: (count: number) => 'Validate the remaining partitions (' + count + ').',
        candidates: (count: number) => 'Finish validating the remaining verdicts (' + count + ').',
        failed: 'Inspect the workflow before retrying.',
        noAction: 'No action required.',
        previous: 'Last verified review',
        first: 'No verified review yet',
    },
    es: {
        preparing: 'Completar la preparación de la comparación fijada.',
        analyzing: 'Validar el análisis restante del diff.',
        verifying: 'Completar la validación de los dictámenes pendientes.',
        publishing: 'Conciliar la revisión validada y publicar el resultado.',
        partitions: (count: number) => 'Validar las particiones pendientes (' + count + ').',
        candidates: (count: number) => 'Completar la validación de los dictámenes pendientes (' + count + ').',
        failed: 'Consulta la ejecución antes de reintentar.',
        noAction: 'No hace falta intervenir.',
        previous: 'Última revisión verificada',
        first: 'Aún no hay una revisión verificada',
    },
} as const;

function renderUpcomingWork(observation: BugbotReviewProgressObservation, labels: typeof nextStep.en | typeof nextStep.es): string {
    if (observation.stage === 'finished') return labels.failed;
    const work = observation.stage === 'analyzing' ? observation.partitions
        : observation.stage === 'verifying' ? observation.candidates : undefined;
    const remaining = work && work.total - work.completed;
    const summary = remaining ? (observation.stage === 'analyzing' ? labels.partitions(remaining) : labels.candidates(remaining))
        : labels[observation.stage];
    return summary + ' ' + labels.noAction;
}

export function renderBugbotStatusCardUpdate(snapshot: BugbotStatusCardSnapshot): string | undefined {
    const { source, review, verifiedBody, locale, repositoryUrl, canonical } = snapshot;
    const stored = readCard(canonical?.body, source.pullNumber);
    if (!stored || (verifiedBody !== undefined && readBugbotStatusCardHead(verifiedBody, source.pullNumber) !== source.head)) return undefined;
    const sourceKey = createHash('sha256').update([source.repositoryId, source.pullNumber, source.base, source.baseRef,
        source.head, source.policy, review.runId, review.attempt].join(':')).digest('hex');
    const terminal = terminalMarker.exec(stored.previous);
    if (review.state === 'complete') {
        if (verifiedBody === undefined) return undefined;
        return review.closeAttempt
            ? verifiedBody + '\n\n<!-- copilot-bugbot-card-terminal schema="1" source="' + sourceKey + '" -->'
            : verifiedBody + (terminal?.[0] ?? '');
    }
    if (terminal?.[1] === sourceKey) return verifiedBody === undefined ? stored.previous : verifiedBody + terminal[0];
    const previous = verifiedBody ?? stored.previous;

    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?\/[\w.-]+\/[\w.-]+$/iu.test(repositoryUrl)
        || review.runUrl !== `${repositoryUrl}/actions/runs/${review.runId}/attempts/${review.attempt}`) return undefined;
    const externalId = ['bugbot', source.pullNumber, source.base, source.head, source.policy, review.runId, review.attempt].join(':');
    const observation = readBugbotProgressCheckObservation(review.checkDetails, externalId);
    if (!observation || (observation.baseRefSha ?? observation.baseSha) !== source.baseRef
        || (observation.stage === 'finished' && (review.state !== 'interrupted' || observation.outcome !== 'failed'))) return undefined;

    const digest = createHash('sha256').update(JSON.stringify(observation)).digest('hex');
    if (stored.progress?.source === sourceKey && (observation.sequence < stored.progress.sequence
        || (observation.sequence === stored.progress.sequence && digest !== stored.progress.digest))) return undefined;

    const labels = /^es(?:-|$)/iu.test(locale) ? nextStep.es : nextStep.en;
    const previousHead = readBugbotStatusCardHead(previous, source.pullNumber);
    const previousTitle = previousHead ? `${labels.previous} · \`${previousHead.slice(0, 8)}\`` : labels.first;
    const displayed: BugbotReviewProgressObservation = review.state === 'interrupted'
        ? { ...observation, stage: 'finished', outcome: 'failed' } : observation;
    const view = renderBugbotLiveProgress(displayed, locale, review.runUrl);
    return [
        `${progressStart}pr="${source.pullNumber}" source="${sourceKey}" sequence="${observation.sequence}" digest="${digest}" -->`,
        view.summary, '', renderUpcomingWork(displayed, labels), '', `### ${previousTitle}`,
    ].join('\n') + progressEnd + previous;
}

export async function publishBugbotStatusCard(
    wakeup: BugbotStatusCardWakeup, lane: BugbotStatusCardPublicationLane,
): Promise<BugbotStatusCardEffect> {
    if (wakeup.dryRun) return 'dry-run';
    const { source, runId, attempt } = wakeup;
    if (!isBugbotStatusCardSource(source) || !positive(runId) || !positive(attempt)) return 'skipped';
    return lane.exclusive(source.repositoryId, source.pullNumber, async writer => {
        const snapshot = await writer.read();
        if (!snapshot || !sameSource(source, snapshot.source)
            || snapshot.review.runId !== runId || snapshot.review.attempt !== attempt
            || (snapshot.canonical !== undefined && !positive(snapshot.canonical.id))) return 'skipped';
        const body = renderBugbotStatusCardUpdate(snapshot);
        if (body === undefined || Buffer.byteLength(body, 'utf8') > maxCommentBytes) return 'skipped';
        if (body === snapshot.canonical?.body) return 'unchanged';
        if (!await writer.isCurrent(snapshot)) return 'skipped';
        await writer.publish({ id: snapshot.canonical?.id, body });
        return snapshot.canonical ? 'updated' : 'created';
    });
}
