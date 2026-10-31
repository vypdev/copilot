import { Parser } from 'commonmark';
import {
    MANAGED_PULL_REQUEST_DESCRIPTION_START,
    MANAGED_PULL_REQUEST_DESCRIPTION_END,
    type PullRequestDescriptionMode,
} from './pull_request_description';
import { readPendingPullRequestLink, removePendingPullRequestLink, type PullRequestLinkIdentity } from './pull_request_issue_link_state';

const CLOSING_WORDS = new Set(['close', 'closes', 'closed', 'fix', 'fixes', 'fixed', 'resolve', 'resolves', 'resolved']);
const EMPTY = { managed: false, outside: false };
const REFERENCE = /^[ \t]*([A-Za-z]+):?[ \t]+(?:([A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+))?#([1-9][0-9]*)\.?[ \t]*\r?$/u;

/** Source spelling and Markdown structure must both establish explicit closing intent. */
function referencePresence(body: string, repository: string, issueNumber: number): typeof EMPTY {
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) return EMPTY;
    const pending = readPendingPullRequestLink(body);
    if (pending.kind === 'blocked') return EMPTY;
    const source = pending.kind === 'pending' ? removePendingPullRequestLink(body, pending.marker) : body;
    const markerStart = source.indexOf(MANAGED_PULL_REQUEST_DESCRIPTION_START);
    const markerEnd = source.indexOf(MANAGED_PULL_REQUEST_DESCRIPTION_END, markerStart + MANAGED_PULL_REQUEST_DESCRIPTION_START.length);
    const range = markerStart >= 0 && markerEnd >= markerStart
        ? { start: markerStart + MANAGED_PULL_REQUEST_DESCRIPTION_START.length, end: markerEnd }
        : undefined;
    let offset = 0;
    const lines = source.split('\n');
    const offsets = lines.map(line => { const start = offset; offset += line.length + 1; return start; });
    const walker = new Parser().parse(source).walker();
    let event;
    let managed = false;
    let outside = false;
    while ((event = walker.next())) {
        const node = event.node;
        if (!event.entering || node.type !== 'paragraph' || node.parent!.type !== 'document') continue;
        // CommonMark paragraph nodes have source positions. Inspect the raw line,
        // so entity/escape decoding cannot invent a closing-reference spelling.
        const [[firstLine], [lastLine]] = node.sourcepos!;
        if (firstLine !== lastLine) continue;
        const line = lines[firstLine - 1];
        const reference = REFERENCE.exec(line);
        if (!reference || !CLOSING_WORDS.has(reference[1].toLowerCase())) continue;
        if (Number(reference[3]) !== issueNumber
            || (reference[2] !== undefined && reference[2].toLowerCase() !== repository.toLowerCase())) continue;
        const start = offsets[firstLine - 1];
        const inside = range !== undefined && start >= range.start && start + line.length <= range.end;
        if (inside) managed = true;
        else outside = true;
    }
    return { managed, outside };
}

export function hasExplicitClosingReference(body: string, repository: string, issueNumber: number): boolean {
    const presence = referencePresence(body, repository, issueNumber);
    return presence.managed || presence.outside;
}

/** Preserve only intent that the selected ownership mode would otherwise erase. */
export function shouldPreserveClosingReference(
    body: string,
    mode: PullRequestDescriptionMode,
    identity: PullRequestLinkIdentity,
    issueNumber: number | undefined,
): boolean {
    if (typeof issueNumber !== 'number' || !Number.isSafeInteger(issueNumber) || issueNumber <= 0
        || issueNumber === identity.number || identity.repository !== identity.headRepository
        || !identity.headRef.includes('/')
        || !identity.headRef.slice(identity.headRef.lastIndexOf('/') + 1).startsWith(`${issueNumber}-`)) return false;
    const presence = referencePresence(body, identity.repository, issueNumber);
    switch (mode) {
        case 'replace': return presence.managed || presence.outside;
        case 'append':
        case 'preserve': return presence.managed && !presence.outside;
        case 'disabled': return false;
    }
}
