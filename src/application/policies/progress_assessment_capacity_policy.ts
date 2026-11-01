import { ApplicationError } from '../errors/application_error';
import { isProgressRequirementId, isProgressSourceLineId } from '../../domain/progress_response_diagnostic';

export const MAX_PROGRESS_FACT_POINTS = 800;
export const MAX_PROGRESS_ASSESSMENT_POINTS = 8_000;
type Requirement = Readonly<{ id: string; quote: string }>;

/** Shared host framing; these exact characters consume the published field budget. */
export function progressAssessmentPrefix(requirement: Requirement): string {
    return `[${requirement.id}] ${requirement.quote} — `;
}

/** Reserve every original citation and a nonempty fact before any evidence/assessment query. */
export function progressAssessmentFactLimit(requirements: readonly Requirement[], anchors: Readonly<Record<string, string>> = {}): number {
    const prefixPoints = requirements.map(requirement => [...progressAssessmentPrefix(requirement)].length);
    const fixedPoints = prefixPoints.reduce((sum, points) => sum + points, Math.max(0, requirements.length - 1));
    if (fixedPoints + requirements.length > MAX_PROGRESS_ASSESSMENT_POINTS) {
        let points = 0;
        const index = prefixPoints.findIndex((size, i) => {
            points += size + 1 + (i === 0 ? 0 : 1);
            return points > MAX_PROGRESS_ASSESSMENT_POINTS;
        });
        const id = requirements[index].id;
        const requirementId = isProgressRequirementId(id) ? id : 'none';
        const sourceLineId = requirementId !== 'none' && isProgressSourceLineId(anchors[id]) ? anchors[id] : 'none';
        throw new ApplicationError('validation.evidence-too-large', 'Original progress citations cannot fit the unchanged assessment text limits. Existing progress was retained.', {
            recovery: { id: 'progress-assessment-capacity-exceeded', variables: {
                phase: 'assessment', reason: 'assessment-text-limit', field: `$.requirements[${index}].summary`, requirementId, sourceLineId,
            } },
        });
    }
    return requirements.length === 0 ? MAX_PROGRESS_FACT_POINTS
        : Math.min(MAX_PROGRESS_FACT_POINTS, Math.floor((MAX_PROGRESS_ASSESSMENT_POINTS - fixedPoints) / requirements.length));
}
