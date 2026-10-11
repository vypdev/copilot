import { GITHUB_RUNTIME_DOCTOR_GROUPS, type GithubRuntimeDoctorReport } from '../../domain/github_runtime_doctor';
import { resolveStaticPublicationCatalog, type PublicationMessageCatalog, type PublicationMessageId } from './publication_message_catalog';
export interface GithubRuntimeDoctorProjection {
    readonly report?: GithubRuntimeDoctorReport;
    readonly serverOrigin?: string; readonly revision?: string; readonly owner?: string; readonly repository?: string;
}
const ACTIONS = ['configuration', 'workflow', 'retry', 'issue', 'specifications', 'branch', 'policy', 'declared'] as const;
const STATES = ['pass', 'warning', 'blocked', 'unavailable', 'not-applicable'] as const;
export function isGithubRuntimeDoctorProjection(value: unknown): value is GithubRuntimeDoctorProjection {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const projection = value as GithubRuntimeDoctorProjection;
    const report = projection.report;
    if (['serverOrigin', 'revision', 'owner', 'repository'].some(key => {
        const field = (projection as Record<string, unknown>)[key]; return field !== undefined && (typeof field !== 'string' || field.length > 300);
    })) return false;
    if (report === undefined) return true;
    if (!report || typeof report !== 'object' || !report.target || !Number.isSafeInteger(report.target.repositoryId)
        || report.target.repositoryId < 1 || (report.target.kind !== 'issue' && report.target.kind !== 'pull-request')
        || !Number.isSafeInteger(report.target.kind === 'issue' ? report.target.issueNumber : report.target.pullNumber)
        || (report.target.kind === 'issue' ? report.target.issueNumber : report.target.pullNumber) < 1) return false;
    return STATES.includes(report.severity) && Array.isArray(report.checks) && report.checks.length === 7
        && report.checks.every((check, index) => check && check.group === GITHUB_RUNTIME_DOCTOR_GROUPS[index] && STATES.includes(check.state))
        && (report.primaryAction === undefined || ACTIONS.includes(report.primaryAction as typeof ACTIONS[number]));
}
export function formatGithubRuntimeDoctor(projection: GithubRuntimeDoctorProjection, locale = 'en-US',
    catalog: PublicationMessageCatalog = resolveStaticPublicationCatalog(locale).catalog): string {
    if (!isGithubRuntimeDoctorProjection(projection)) projection = {};
    const message = (suffix: string) => catalog.render(`interaction.doctor.${suffix}` as PublicationMessageId);
    const severity = projection.report?.severity ?? 'unavailable';
    const action = projection.report?.primaryAction;
    const lines = [`## 🩺 ${message('heading')}: ${message(`state.${severity}`)}`, '',
        message(`summary.${severity}`), '',
        `**${message('action')}:** ${action && ACTIONS.includes(action as typeof ACTIONS[number]) ? message(`action.${action}`)
            : severity === 'pass' || severity === 'not-applicable' ? message('action.none') : message('action.retry')}`,
        '', message('readonly'), '', `### ${message('checks')}`, ''];
    const source = repositorySource(projection);
    const origin = source?.split('/').slice(0, 5).join('/');
    for (const group of GITHUB_RUNTIME_DOCTOR_GROUPS) {
        const state = projection.report?.checks.find(check => check.group === group)?.state ?? 'unavailable';
        const evidence = projection.report?.checks.find(check => check.group === group)?.evidence?.source;
        const target = projection.report?.target;
        const link = origin && target && group === 'pull-request-identity' && target.kind === 'pull-request'
            ? `${origin}/pull/${target.pullNumber}` : origin && target && target.kind === 'issue'
                && (group === 'issue-readiness' || group === 'linked-branch-readiness') ? `${origin}/issues/${target.issueNumber}` : undefined;
        const policySource = group === 'approval-policy' && (evidence === 'repository' || evidence === 'organization' || evidence === 'default-off')
            ? message(`source.${evidence}`) : undefined;
        const mode = group === 'approval-prerequisites' && (evidence === 'off' || evidence === 'recommend' || evidence === 'guarded')
            ? `${message('mode')}: ${evidence}` : undefined;
        lines.push(`- **${message(`group.${group}`)}:** ${message(`state.${state}`)}${policySource ? ` · ${policySource}` : ''}${mode ? ` · ${mode}` : ''}${link ? ` · [${message('source')}](${link})` : ''}`);
    }
    if (source) lines.push('', `[${message('source')}](${source})`);
    return lines.join('\n');
}
function repositorySource(value: GithubRuntimeDoctorProjection): string | undefined {
    if (!value.serverOrigin || !value.revision || !/^[a-f0-9]{40}$/u.test(value.revision)
        || !value.owner || !value.repository || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/u.test(value.owner)
        || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u.test(value.repository)) return undefined;
    try {
        const url = new URL(value.serverOrigin);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
            || url.pathname !== '/' || url.origin !== value.serverOrigin.replace(/\/$/u, '')) return undefined;
        return `${url.origin}/${value.owner}/${value.repository}/tree/${value.revision}`;
    } catch { return undefined; }
}
