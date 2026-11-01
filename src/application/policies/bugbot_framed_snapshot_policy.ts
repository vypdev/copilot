import type { BugbotFramedReviewSource } from '../../domain/bugbot/framed_review';
import type { PullRequestReviewDiffSnapshot, PullRequestDiffLocation } from '../ports/bugbot_pull_request_read_ports';

/** Recovered source receives exact commentable coordinates; absent native patches are never left unaddressable. */
export function projectBugbotFramedSnapshot(source: BugbotFramedReviewSource): PullRequestReviewDiffSnapshot {
    const changes = source.changes.map(change => ({ ...change }));
    const filesWithDiffLocations = changes.map(change => {
        const locations: PullRequestDiffLocation[] = [];
        let old = 0, current = 0, inside = false;
        for (const line of change.patch.split('\n')) {
            const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
            if (hunk) { old = Number(hunk[1]); current = Number(hunk[2]); inside = true; continue; }
            if (!inside || line === '' || line.startsWith('\\')) continue;
            if (line.startsWith('-')) { locations.push({ line: old++, side: 'LEFT' }); }
            else if (line.startsWith('+')) { locations.push({ line: current++, side: 'RIGHT' }); }
            else if (line.startsWith(' ')) { locations.push({ line: current++, side: 'RIGHT' }); old++; }
        }
        return { path: change.filename, locations };
    }).filter(file => file.locations.length > 0);
    return { changes, filesWithDiffLocations,
        filesWithFirstDiffLine: filesWithDiffLocations.flatMap(file => {
            const first = file.locations.find(location => location.side === 'RIGHT');
            return first ? [{ path: file.path, firstLine: first.line }] : [];
        }) };
}
