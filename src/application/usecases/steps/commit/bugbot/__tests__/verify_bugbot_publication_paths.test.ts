import { Parser } from 'commonmark';
import { prepareBugbotFindings } from '../prepare_bugbot_findings';
import { projectVerifiedBugbotPublication } from '../verify_bugbot_publication_policy';
import type { BugbotShadowVerificationReport } from '../observe_bugbot_shadow_verification';
import { buildCommentBody } from '../../../../../policies/bugbot_finding_marker_policy';

it.each(['[Docs](https:review.example.invalid).ts', 'src/``[Docs](https:review.example.invalid)`name.ts', 'src/ordinary.ts'])(
    'renders the Git citation path as literal data: %s', path => {
        const head = 'a'.repeat(40);
        const prepared = prepareBugbotFindings({ findings: [{ id: 'path', title: 'A reachable defect',
            description: 'The route loses the value.', file: path, line: 1 }] }, [], 'low', 2)!;
        const finding = prepared.activeFindings![0];
        const report: BugbotShadowVerificationReport = {
            resolvedModel: 'fixture', provider: 'codex', candidates: [{ id: finding.id, status: 'verdict', verdict: 'confirmed',
                reason: 'The reachable route loses the value.', missing: null, premises: [], wallMs: 0, ordinaryPublication: 'individual',
                candidate: { id: finding.id, hypothesis: finding.title, anchor: { path, line: 1, end: 1 },
                    repository: { owner: 'fixture', name: 'project' }, headSha: head, allowBase: false },
                citations: [{ receipt: 'fixture-receipt', kind: 'git', sha: head, path, first: 1, last: 1, textSha256: 'b'.repeat(64) }],
            }],
        };
        const projection = projectVerifiedBugbotPublication(prepared, report, 2);
        expect(projection.status).toBe('complete');
        if (projection.status === 'invalid') throw new Error('Expected a validated fixture');
        const walker = new Parser().parse(buildCommentBody(projection.prepared.toPublish[0], false)).walker();
        const code: string[] = [], links: string[] = [];
        let event;
        while ((event = walker.next())) {
            if (event.entering && event.node.type === 'link') links.push(event.node.destination!);
            if (event.entering && event.node.type === 'code') code.push(event.node.literal!);
        }
        expect(links).toEqual([]);
        expect(code).toEqual([`${path}:1`, `${path}:1`]);
    },
);
