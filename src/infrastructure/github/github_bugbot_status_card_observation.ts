import { readBugbotProgressCheckObservation } from '../../application/policies/bugbot_progress_check_observation_policy';
import type {
    BugbotStatusCardSnapshot, BugbotStatusCardWakeup,
} from '../../application/policies/bugbot_status_card_publication_policy';

export const nativeBugbotAnalysisPath = '.github/workflows/copilot_pull_request.yml';

export interface NativeGithubRun {
    readonly id: number;
    readonly created_at?: string;
    readonly run_attempt?: number;
    readonly path?: string;
    readonly event?: string;
    readonly status?: string | null;
    readonly conclusion?: string | null;
    readonly repository?: { readonly id: number };
    readonly head_repository?: { readonly id: number } | null;
    readonly pull_requests?: readonly {
        readonly number: number;
        readonly head: { readonly sha: string; readonly repo: { readonly id: number } };
        readonly base: { readonly sha: string; readonly repo: { readonly id: number } };
    }[] | null;
}

export interface NativeGithubCheck {
    readonly id: number;
    readonly name: string;
    readonly head_sha: string;
    readonly external_id?: string | null;
    readonly details_url?: string | null;
    readonly status: string;
    readonly app?: { readonly slug?: string } | null;
    readonly output?: { readonly summary?: string | null; readonly text?: string | null } | null;
}

/** Read after job admission, using the exact native run and a complete check list. */
export function readNativeBugbotStatusCardReview(
    wakeup: BugbotStatusCardWakeup, repositoryUrl: string, run: NativeGithubRun,
    checks: { readonly total_count: number; readonly check_runs: readonly NativeGithubCheck[] },
): BugbotStatusCardSnapshot['review'] | undefined {
    const { source, runId, attempt } = wakeup;
    if (run.id !== runId || run.run_attempt !== attempt || run.path !== nativeBugbotAnalysisPath || run.event !== 'pull_request'
        || run.repository?.id !== source.repositoryId || run.head_repository?.id !== source.repositoryId
        || run.pull_requests?.length !== 1 || checks.total_count !== checks.check_runs.length) return undefined;
    const [pull] = run.pull_requests;
    if (pull.number !== source.pullNumber || pull.head.sha !== source.head || pull.base.sha !== source.base
        || pull.head.repo.id !== source.repositoryId || pull.base.repo.id !== source.repositoryId) return undefined;
    const externalId = ['bugbot', source.pullNumber, source.base, source.head, source.policy, runId, attempt].join(':');
    const runUrl = repositoryUrl + '/actions/runs/' + runId + '/attempts/' + attempt;
    const matches = checks.check_runs.filter(check => check.name === 'Copilot / Review' && check.head_sha === source.head
        && check.external_id === externalId && check.app?.slug === 'github-actions'
        && (check.details_url === runUrl || check.details_url === repositoryUrl + '/runs/' + check.id));
    if (matches.length !== 1 || !Number.isSafeInteger(matches[0].id) || matches[0].id < 1) return undefined;
    const [check] = matches;
    const details = [check.output?.summary, check.output?.text].flatMap(text => {
        if (!text) return [];
        const observation = readBugbotProgressCheckObservation(text, externalId);
        return observation && (observation.baseRefSha ?? observation.baseSha) === source.baseRef
            ? [{ text, observation }] : [];
    });
    if (details.length !== 1) return undefined;
    const [{ text: checkDetails, observation }] = details;
    const interrupted = (run.status === 'completed' && ['failure', 'cancelled', 'timed_out'].includes(run.conclusion ?? ''))
        || (observation.stage === 'finished' && observation.outcome === 'failed' && run.status === 'in_progress');
    if (!interrupted && (run.status !== 'in_progress' || check.status !== 'in_progress')) return undefined;
    return { state: interrupted ? 'interrupted' : 'active', runId, attempt, runUrl, checkDetails };
}
