import { readSddAcceptanceRows } from '../../domain/sdd_draft_consistency';
import type { ProgressSddPublication } from '../ports/progress_sdd_seed_ports';
import { ApplicationError } from '../errors/application_error';
import type { ProgressScopeSource, ProgressScopeSourceLine } from './progress_scope_source_policy';
import type { SddSeedInput } from './sdd_selection_policy';

export function progressSddSeedUnavailable(): ApplicationError {
    return new ApplicationError('validation.evidence-unavailable',
        'Existing progress was retained. Commit could not verify the selected SDD draft for this issue and head. Check the draft markers and confirm the current selection and verified SDD publication on the linked branch, then rerun Commit.',
        { recovery: { id: 'progress-sdd-seed-unverified', variables: {} } });
}

/** Only a verified publication can change the original human-line inventory. */
export function reconcileProgressSddScope(source: ProgressScopeSource, seed: Extract<SddSeedInput, { seed: string }>,
    publication: ProgressSddPublication): ProgressScopeSource {
    const required = new Set<string>();
    const evidence = new Map<string, ProgressScopeSourceLine[]>();
    const index = new Map(source.lines.map(line => [line.id, line]));
    const seedLines = seed.seed.split('\n');
    const firstDraftLine = seed.openingMarkerLine + 1;
    const draftLine = (draftLineNumber: number): ProgressScopeSourceLine => {
        const draftLineOffset = draftLineNumber - 1;
        const issueLineNumber = firstDraftLine + draftLineOffset;
        const line = index.get('L' + issueLineNumber);
        if (!line || line.quote !== seedLines[draftLineOffset].trim()) throw progressSddSeedUnavailable();
        return { ...line, origin: 'draft' };
    };
    const cases = new Set<string>();
    const exactGoal = new Map<string, string | undefined>();
    try {
        for (const row of readSddAcceptanceRows(seed.seed)) {
            const { id } = draftLine(row.line);
            required.add(id);
            exactGoal.set(row.behavior, exactGoal.has(row.behavior) ? undefined : id);
            evidence.set(id, row.cases.map(number => {
                const line = draftLine(number);
                cases.add(line.id);
                return line;
            }));
        }
    } catch {
        throw progressSddSeedUnavailable();
    }
    const lines = source.lines.flatMap<ProgressScopeSourceLine>(line => {
        const number = Number(line.id.slice(1));
        if (number === seed.openingMarkerLine || number === seed.closingMarkerLine || cases.has(line.id)) return [];
        if (number >= firstDraftLine && number < seed.closingMarkerLine) return [{ ...line, origin: 'draft' as const }];
        const canonical = exactGoal.get(line.quote);
        const original = { ...line, origin: 'issue' as const };
        if (canonical) {
            evidence.get(canonical)!.push(original);
            return [];
        }
        return [original];
    });
    return { ...source, lines, draft: { publication, required, evidence } };
}
