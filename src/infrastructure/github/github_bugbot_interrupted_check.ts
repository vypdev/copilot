import { nativePageSize, readCompleteNativeList } from './native_list_pagination';
import { sanitizeAgentMarkdown } from '../../application/policies/github_comment_publication_policy';
import { buildBugbotProgressCheckMarker, readBugbotProgressCheckObservation } from '../../application/policies/bugbot_progress_check_observation_policy';
import { canonicalGitObjectId } from '../../domain/git_object_id';
import { parsePositiveSafeInteger } from '../../domain/positive_integer_policy';

interface NativeCheck {
    readonly id: number;
    readonly name: string;
    readonly head_sha: string;
    readonly status: string;
    readonly external_id?: string | null;
    readonly app?: { readonly slug?: string } | null;
    readonly output: { readonly summary?: string | null };
}

interface CheckApi {
    listForRef(input: { owner: string; repo: string; ref: string; check_name: string; status: 'in_progress'; filter: 'all'; per_page: number; page: number }):
        Promise<{ data: { total_count: number; check_runs: NativeCheck[] } }>;
    update(input: { owner: string; repo: string; check_run_id: number; status: 'completed'; conclusion: Conclusion;
        output: { title: string; summary: string } }): Promise<unknown>;
}
const conclusions = ['failure', 'cancelled', 'timed_out'] as const;
type Conclusion = typeof conclusions[number];

interface InterruptedReview {
    readonly runId: number;
    readonly attempt: number;
    readonly pullNumber: number;
    readonly head: string;
    readonly base: string;
    readonly conclusion: Conclusion;
}

/** Admits only the native completion event of a same-repository Bugbot PR analysis. */
export function readInterruptedBugbotReview(event: string, payload: unknown, repositoryId: number): InterruptedReview | undefined {
    if (event !== 'workflow_run' || !payload || typeof payload !== 'object') return undefined;
    const { action, workflow_run: run } = payload as {
        action?: unknown;
        workflow_run?: {
            id?: unknown; run_attempt?: unknown; event?: unknown; path?: unknown; status?: unknown; conclusion?: unknown;
            repository?: { id?: unknown }; head_repository?: { id?: unknown };
            pull_requests?: readonly { number?: unknown; head?: { sha?: unknown; repo?: { id?: unknown } };
                base?: { sha?: unknown; repo?: { id?: unknown } } }[];
        };
    };
    if (action !== 'completed' || run?.status !== 'completed' || run.event !== 'pull_request'
        || run.path !== '.github/workflows/copilot_pull_request.yml'
        || !conclusions.includes(run.conclusion as Conclusion)
        || run.repository?.id !== repositoryId || run.head_repository?.id !== repositoryId
        || !Array.isArray(run.pull_requests) || run.pull_requests.length !== 1) return undefined;
    const [pull] = run.pull_requests;
    if (pull?.head?.repo?.id !== repositoryId || pull.base?.repo?.id !== repositoryId) return undefined;
    const runId = parsePositiveSafeInteger(run.id);
    const attempt = parsePositiveSafeInteger(run.run_attempt);
    const pullNumber = parsePositiveSafeInteger(pull.number);
    const head = canonicalGitObjectId(pull.head.sha);
    const base = canonicalGitObjectId(pull.base.sha);
    return runId && attempt && pullNumber && head && base
        ? { runId, attempt, pullNumber, head, base, conclusion: run.conclusion as Conclusion } : undefined;
}

/** Closes only the interrupted attempt's own presentation check, with no terminal review receipt. */
export async function settleInterruptedBugbotCheck(
    checks: CheckApi, owner: string, repo: string, review: InterruptedReview, locale: string,
): Promise<boolean> {
    const { head, base, pullNumber, runId, attempt, conclusion } = review;
    const records = await readCompleteNativeList<NativeCheck>(async page => {
        const { data } = await checks.listForRef({
            owner, repo, ref: head, check_name: 'Copilot / Review', status: 'in_progress', filter: 'all', per_page: nativePageSize, page,
        });
        return { total: data.total_count, items: data.check_runs };
    });
    if (!records) return false;
    const identity = new RegExp(`^bugbot:${pullNumber}:${base}:${head}:(?:default|[a-f0-9]{64}):${runId}:${attempt}$`, 'u');
    const matching = records.filter(check => check.name === 'Copilot / Review' && check.head_sha === head
        && check.status === 'in_progress' && check.app?.slug === 'github-actions'
        && typeof check.external_id === 'string' && identity.test(check.external_id));
    if (matching.length !== 1 || !parsePositiveSafeInteger(matching[0].id)) return false;
    const [check] = matching;
    const spanish = /^es(?:-|$)/iu.test(locale);
    const title = spanish ? 'Revisión de Bugbot interrumpida' : 'Bugbot review interrupted';
    const copy = spanish
        ? { failure: 'falló', cancelled: 'se canceló', timed_out: 'agotó su tiempo' }
        : { failure: 'failed', cancelled: 'was canceled', timed_out: 'timed out' };
    const message = spanish
        ? `La ejecución nativa ${copy[conclusion]}. Consulta su diagnóstico antes de reintentar. Cualquier revisión verificada anterior sigue disponible.`
        : `The native run ${copy[conclusion]}. Inspect the run before retrying. Any previous verified review remains available.`;
    const original = check.output.summary ?? '';
    const previous = readBugbotProgressCheckObservation(original, check.external_id!);
    const observation = sanitizeAgentMarkdown(original.replace(/<!-- copilot-bugbot-progress:v1 [^\r\n]{1,3000} -->/gu, '').trimEnd(), 4_000)
        .replace(/copilot-bugbot-verification/gu, 'copilot-bugbot-receipt');
    const observationMarker = previous && buildBugbotProgressCheckMarker(previous, check.external_id!);
    await checks.update({
        owner, repo, check_run_id: check.id, status: 'completed', conclusion,
        output: { title, summary: [`**${title}** · \`${head.slice(0, 8)}\``, message, observation, observationMarker].filter(Boolean).join('\n\n') },
    });
    return true;
}
