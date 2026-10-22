/** The comment coordinator is a versioned Copilot workflow, not an arbitrary reusable job. */
export const COPILOT_COMMENT_RUNTIME = 'copilot_comment_runtime.yml';
export const COPILOT_COMMENT_SELF_WORKFLOW = `$/.github/workflows/${COPILOT_COMMENT_RUNTIME}`;
export const COPILOT_COMMENT_REMOTE_WORKFLOW = `vypdev/copilot/.github/workflows/${COPILOT_COMMENT_RUNTIME}@v3`;

export function isCopilotCommentWorkflow(value: unknown): value is string {
    return typeof value === 'string' && (value === COPILOT_COMMENT_SELF_WORKFLOW
        || /^vypdev\/copilot\/\.github\/workflows\/copilot_comment_runtime\.yml@(?:v3(?:\.[0-9]+\.[0-9]+)?|[a-f0-9]{40})$/u.test(value));
}

const literal = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 100
    && value === value.trim() && !/[\p{Cc}\p{Cf}${}<>]/u.test(value);
const labels = (value: unknown): boolean => literal(value) || Array.isArray(value) && value.length > 0 && value.length <= 10
    && value.every(literal) && new Set(value.map(label => label.toLowerCase())).size === value.length;

/** Runner routing is literal data; expressions need their original full workflow reviewed. */
export function isCopilotCommentRunner(value: unknown): boolean {
    if (labels(value)) return true;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const route = value as Record<string, unknown>;
    const keys = Object.keys(route);
    return keys.length > 0 && (route.group !== undefined || route.labels !== undefined)
        && keys.every(key => key === 'group' || key === 'labels')
        && (route.group === undefined || literal(route.group))
        && (route.labels === undefined || labels(route.labels));
}

export function copilotCommentRunner(job: Record<string, unknown> | undefined): unknown {
    if (!job || !isCopilotCommentWorkflow(job.uses)) return job?.['runs-on'];
    const inputs = job.with as Record<string, unknown> | undefined;
    if (typeof inputs?.['runs-on'] !== 'string') throw new Error('Comment workflow runner JSON is unavailable; review the workflow separately.');
    try {
        if (inputs['runs-on'].length > 16_000) throw new Error('Runner JSON exceeds its bound.');
        const route: unknown = JSON.parse(inputs['runs-on']);
        if (!isCopilotCommentRunner(route)) throw new Error('Unsupported execution route.');
        return route;
    }
    catch { throw new Error('Comment workflow runner JSON is invalid; review the workflow separately.'); }
}
