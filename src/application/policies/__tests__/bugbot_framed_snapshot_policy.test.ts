import { projectBugbotFramedSnapshot } from '../bugbot_framed_snapshot_policy';
import { framedSource, framedChange } from './fixtures/bugbot_framed_fixture';
it('projects both sides, multiple hunks, context lines and missing-LF markers from verified recovery', () => {
    const snapshot = projectBugbotFramedSnapshot(framedSource([framedChange({ patch: '@@ -4,2 +4,2 @@\n context\n-old\n+new\n\\ No newline at end of file\n\n@@ -20 +20 @@\n-other\n+last\n' })]));
    expect(snapshot.filesWithDiffLocations[0].locations).toEqual([{ line: 4, side: 'RIGHT' }, { line: 5, side: 'LEFT' },
        { line: 5, side: 'RIGHT' }, { line: 20, side: 'LEFT' }, { line: 20, side: 'RIGHT' }]);
    expect(snapshot.filesWithFirstDiffLine).toEqual([{ path: 'src/example.ts', firstLine: 4 }]);
});
it('keeps deleted-only locations addressable without inventing a right-side line for metadata-only changes', () => {
    const snapshot = projectBugbotFramedSnapshot(framedSource([framedChange({ status: 'removed', patch: '@@ -2 +1,0 @@\n-removed\n' }),
        framedChange({ filename: 'empty', patch: '{"kind":"verified-metadata-only"}' })]));
    expect(snapshot.filesWithDiffLocations).toEqual([{ path: 'src/example.ts', locations: [{ line: 2, side: 'LEFT' }] }]);
    expect(snapshot.filesWithFirstDiffLine).toEqual([]);
});
it('never assigns a source line to an unknown non-diff marker', () => {
    expect(projectBugbotFramedSnapshot(framedSource([framedChange({ patch: '@@ -1,0 +1,0 @@\nuntrusted marker\n' })])).filesWithDiffLocations).toEqual([]);
});
