import { ApplicationError } from '../errors/application_error';
import type { ProgressComparisonSource, ProgressPullRequestSource } from '../ports/progress_comparison_source_ports';

/** Native branch refs are data, never a shell operand, URL, SHA or model instruction. */
export function isProgressComparisonBranch(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 255
        && value !== '@' && !value.startsWith('-') && !value.endsWith('.') && !value.includes('..') && !value.includes('@{')
        && !Array.from(value).some(point => { const code = point.codePointAt(0)!; return code <= 32 || code === 127 || '~^:?*[\\'.includes(point); })
        && value.split('/').every(segment => segment.length > 0 && !segment.startsWith('.') && !segment.endsWith('.lock'));
}

export function selectProgressComparisonSource(source: ProgressPullRequestSource, developmentBranch: string, headBranch: string, headSha: string): ProgressComparisonSource {
    if (!isProgressComparisonBranch(developmentBranch) || !isProgressComparisonBranch(headBranch) || !/^[a-f0-9]{40}$/u.test(headSha)) {
        throw new ApplicationError('configuration.invalid', 'Progress comparison requires verified branch names and source identity.');
    }
    if (source.kind === 'ambiguous') throw new ApplicationError('validation.evidence-unavailable', 'Multiple open pull requests own this exact branch. Select one intended review target before progress can be assessed. Existing progress was retained.');
    if (source.kind === 'none') return Object.freeze({ kind: 'development', baseBranch: developmentBranch });
    if (!Number.isSafeInteger(source.number) || source.number < 1 || !isProgressComparisonBranch(source.baseBranch)
        || source.baseBranch === headBranch || source.headSha !== headSha) {
        throw new ApplicationError('workflow.stale', 'The native pull request comparison source could not be pinned. Existing progress was retained.');
    }
    return Object.freeze({ kind: 'pull-request', baseBranch: source.baseBranch, pullRequestNumber: source.number, headSha });
}

export function sameProgressComparisonSource(left: ProgressComparisonSource, right: ProgressComparisonSource): boolean {
    if (left.kind === 'development') return right.kind === 'development' && left.baseBranch === right.baseBranch;
    return right.kind === 'pull-request' && left.baseBranch === right.baseBranch
        && left.pullRequestNumber === right.pullRequestNumber && left.headSha === right.headSha;
}
